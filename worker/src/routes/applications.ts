import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb, type Db } from "../db/client";
import { loanApplications, underwritingNotes, caseReferrals } from "../db/schema";
import { AppError } from "../lib/errors";
import { columnForSection, calculateCompletion, nextSection, generateApplicationRef, flattenAllSectionValues } from "../lib/sections";
import { loanPurpose } from "../lib/app-format";
import { getPreApprovedOffer, consumePreApprovedOffer } from "../lib/pre-approved";
import { generateDataVerification, resolveDataVerificationRule } from "../lib/data-verification";
import { generateBusinessFinancialsAnalysis } from "../lib/business-financials";
import { requireAuth, assertEntitlement, isStaff } from "../middleware/auth";
import { SECTION_SCHEMAS, formatZodIssues } from "../lib/section-schemas";
import { caseScopeCondition, assertCaseVisible } from "../lib/org";
import { resolveMandate, nextRoleUp, roleCodesAbove, referralLockLabel } from "../lib/mandates";
import { resolveQueue, runAction } from "../lib/workflow/host";
import { loadCase, statusesByCategory } from "../lib/workflow/store";
import { withWorkflowInfo } from "../lib/workflow/assignment";
import type { QueueDef } from "../lib/workflow/types";
import type { TransitionInput } from "../lib/workflow/types";
import { resolveActiveSchemaVersion, withResolvedFormVersion, parseSchema } from "../lib/form-versions";
import { masterValueProblem, loadMasterItemFacts } from "../lib/master-options";
import { isFieldVisible } from "../lib/form-schema-types";
import type { InferSelectModel } from "drizzle-orm";

// Notification emails go through Resend (a real outbound network call — see lib/email.ts) and
// have no bearing on the correctness of the state change they're attached to, so every call site
// below defers them via the request's ExecutionContext.waitUntil rather than awaiting them
// inline: the customer/staff response returns as soon as the DB write is done, and the email
// send completes in the background instead of adding its latency (and failure modes) to the
// request path.
type WaitUntil = (promise: Promise<unknown>) => void;

export const applications = new Hono<AppEnv>();
applications.use("*", requireAuth);

// Every staff action that changes application state (approve, decline, refer, send-back,
// disburse, edit, resolve) must record the AUTHENTICATED caller's identity, never a
// client-supplied field — otherwise a direct API call could write an arbitrary name into the
// audit trail, notes, and outbound emails regardless of who actually holds the session. The
// Angular client already only ever sends the logged-in user's own name here (see
// case-detail.component.ts / banker-case-detail.component.ts), so this is a pure hardening change
// with no behavior difference for legitimate use through the UI.
function actorName(c: Context<AppEnv>): string {
  const user = c.get("authUser");
  return user.fullName?.trim() || user.email || user.role;
}

// Phase 3 - a case referred up the ladder leaves the queues of roles below its target. Roles not
// on the ladder (rank null) are unrestricted.
async function referralVisibility(db: Db, c: Context<AppEnv>) {
  const rank = c.get("authRole").rank;
  if (rank == null) return undefined;
  const above = await roleCodesAbove(db, rank);
  if (above.length === 0) return undefined;
  return or(ne(loanApplications.status, "REFERRED_TO_SENIOR"), isNull(loanApplications.referredToRole), notInArray(loanApplications.referredToRole, above));
}

// Channel-specific field exposure control (2026-09 architecture review, "Field Exposure
// Controls"/"Channel-Specific Validation"): every section save must match that section's known
// shape exactly — unrecognised fields are rejected (400), not silently stored or stripped. Returns
// the validated data so the JSON persisted is always exactly the parsed, in-shape value.
//
// Admin Form Builder integration: an admin-added `kind: "custom"` field on this section is, by
// definition, a key the static per-section schema above has never heard of — and that schema is
// `.strict()`, so it would reject the payload outright as soon as one is present. Custom-field keys
// are split out before the static schema runs, validated separately against the resolved form
// version's own required/type metadata, then merged back into the result — the static schema stays
// exactly as strict as it already was for every field it actually knows about.
async function validateSectionData(
  db: Db,
  app: InferSelectModel<typeof loanApplications>,
  section: string,
  data: unknown
): Promise<Record<string, unknown>> {
  const schema = SECTION_SCHEMAS[section];
  if (!schema) throw new AppError(`Unknown section: ${section}`);

  const resolved = await resolveFormSchema(db, app);
  const allSchemaFields = resolved?.sections.find((s) => s.key === section)?.fields ?? [];
  const customFields = allSchemaFields.filter((f) => f.kind === "custom");
  const isPlainObject = data != null && typeof data === "object" && !Array.isArray(data);
  const staticData: Record<string, unknown> = isPlainObject ? { ...(data as Record<string, unknown>) } : (data as any);
  const customData: Record<string, unknown> = {};
  if (isPlainObject) {
    for (const f of customFields) {
      if (f.key in staticData) {
        customData[f.key] = staticData[f.key];
        delete staticData[f.key];
      }
    }
  }

  const result = schema.safeParse(staticData);
  if (!result.success) {
    throw new AppError(`Invalid data for section '${section}': ${formatZodIssues(result.error)}`);
  }

  const merged = { ...(result.data as Record<string, unknown>), ...customData };

  // Checked across every schema field, not just kind: "custom" — an admin can mark an *existing*
  // field required (e.g. personalDetails' preferredBranch, only asked when assistedByStaff is
  // true) and this is the only server-side enforcement of that, layered on top of (never
  // replacing) whatever the static per-section Zod schema above already requires.
  //
  // A visibility condition can reference a field in *any* section (see form-schema-types.ts's
  // condition engine), so the values a field is checked against span the whole application, not
  // just this section — every other section's last-*saved* data, overlaid with this section's
  // just-validated `merged` data (freshest for the section actually being saved right now).
  const crossSectionValues = { ...flattenAllSectionValues(app), ...Object.fromEntries(Object.entries(merged).map(([k, v]) => [`${section}.${k}`, v])) };
  const evalCtx = { constants: resolved?.constants ?? [], values: crossSectionValues };
  for (const f of allSchemaFields) {
    const visible = !f.hidden && isFieldVisible(f, section, evalCtx);
    const value = merged[f.key];

    if (f.required && visible && (value === undefined || value === null || value === "")) {
      throw new AppError(`Missing required field '${f.key}' for section '${section}'.`);
    }

    // Ordinary input validation, not the (separate, still-paused) backend-dependency-registry
    // feature: if this field declares an option list, the submitted value must be one of those
    // options — and if it's also gated by optionsDependOn, one of the subset valid for whatever
    // the trigger field's just-validated value is. Skipped entirely for a field with no `options`
    // populated (every field today, and these four before their schema is seeded) — zero
    // regression risk — and for a currently-hidden/not-visible field, matching the required-check's
    // own exemption above (a value left over from before the customer backed away from a now-
    // hidden field shouldn't fail the save).
    // Master-sourced field: the value must be an existing item's code (and, for a cascade, belong to the
    // parent chosen in the earlier field). Keeping the previously saved value is always allowed, so old
    // data never blocks an unrelated edit. Same visibility exemption as above.
    if (visible && f.optionsSource && value !== undefined && value !== null && value !== "") {
      const dep = f.optionsSource.dependsOn;
      const problem = masterValueProblem({
        item: await loadMasterItemFacts(db, f.optionsSource.master, String(value)),
        value: String(value),
        previous: flattenAllSectionValues(app)[`${section}.${f.key}`],
        dependsOn: !!dep,
        dependsOnValue: dep ? crossSectionValues[`${section}.${dep.fieldKey}`] : undefined,
      });
      if (problem) throw new AppError(`Field '${f.key}' in section '${section}' ${problem}.`);
    }

    if (visible && f.options?.length && value !== undefined && value !== null && value !== "") {
      const allowed = f.optionsDependOn
        ? new Set(f.optionsDependOn.map[String(crossSectionValues[`${section}.${f.optionsDependOn.fieldKey}`] ?? "")] ?? [])
        : new Set(f.options.map((o) => o.value));
      if (!allowed.has(String(value))) {
        throw new AppError(`Invalid value for field '${f.key}' in section '${section}'.`);
      }
    }
  }

  return merged;
}

async function resolveFormSchema(db: Db, app: InferSelectModel<typeof loanApplications>) {
  const activeVersion = await resolveActiveSchemaVersion(db, app);
  if (!activeVersion) return null;
  try {
    return parseSchema(activeVersion);
  } catch {
    return null;
  }
}

// S6 (ARCHITECTURE_REVIEW_GAPS.md) — "list this customer's applications" had no ownership check at
// all: any authenticated user could enumerate another customer's applications by guessing a numeric
// customerId. Same fix shape as documents.ts's assertOwnsDocument (S1).
function assertOwnsCustomerId(c: Context<AppEnv>, customerId: number) {
  const authUser = c.get("authUser");
  if (isStaff(c)) return;
  if (authUser.id !== customerId) {
    throw new AppError("Forbidden.", 403);
  }
}

// Y1 - a case opened by staff (banker-assisted origination) belongs to that staff member's org
// unit; a customer's own digital application has no branch yet.
function originOrgUnitId(c: Context<AppEnv>): number | null {
  const u = c.get("authUser");
  return isStaff(c) ? u.orgUnitId : null;
}

const waitUntilOf = (c: Context<AppEnv>): WaitUntil => (p) => c.executionCtx.waitUntil(p);

async function getByRef(db: Db, appRef: string) {
  const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, appRef)).limit(1);
  if (!app) throw new AppError(`Application not found: ${appRef}`);
  return app;
}

applications.post("/start", async (c) => {
  const db = getDb(c.env.DB);
  const { customerId, customerEmail } = await c.req.json<{ customerId: number; customerEmail: string }>();

  const [existing] = await db
    .select()
    .from(loanApplications)
    .where(and(eq(loanApplications.customerId, customerId), inArray(loanApplications.status, await statusesByCategory(db, ["DRAFT", "WAITING_CUSTOMER"]))))
    .orderBy(desc(loanApplications.updatedAt))
    .limit(1);
  if (existing) return c.json(existing);

  const now = new Date().toISOString();
  const [created] = await db
    .insert(loanApplications)
    .values({
      applicationRef: generateApplicationRef(),
      customerId,
      customerEmail,
      status: "DRAFT",
      currentSection: "loanRequirements",
      completionPercentage: 0,
      applicationType: "PERSONAL",
      orgUnitId: originOrgUnitId(c),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await loadCase(db, created);
  return c.json(created);
});

applications.post("/start-business", async (c) => {
  const db = getDb(c.env.DB);
  const { customerId, customerEmail } = await c.req.json<{ customerId: number; customerEmail: string }>();

  const [existing] = await db
    .select()
    .from(loanApplications)
    .where(and(eq(loanApplications.customerId, customerId), inArray(loanApplications.status, await statusesByCategory(db, ["DRAFT", "WAITING_CUSTOMER"]))))
    .orderBy(desc(loanApplications.updatedAt))
    .limit(1);
  if (existing) return c.json(existing);

  const now = new Date().toISOString();
  const [created] = await db
    .insert(loanApplications)
    .values({
      applicationRef: generateApplicationRef(),
      customerId,
      customerEmail,
      status: "DRAFT",
      currentSection: "companyDetails",
      completionPercentage: 0,
      applicationType: "BUSINESS",
      orgUnitId: originOrgUnitId(c),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await loadCase(db, created);
  return c.json(created);
});

// Fast-track entry point for an existing customer accepting a pre-approved offer. Pre-fills every
// section with synthetic-but-plausible data except personalDetails (identity + consent) and
// connectBank (confirm repayment account), which stay null so the customer still passes through
// those two stops explicitly via nextSection()'s MANDATORY_STOPS.
applications.post("/start-pre-approved", async (c) => {
  const db = getDb(c.env.DB);
  const { customerId, customerEmail, nationalId } = await c.req.json<{
    customerId: number;
    customerEmail: string;
    nationalId: string;
  }>();

  const offer = await getPreApprovedOffer(db, nationalId);
  if (!offer) throw new AppError("No pre-approved offer found for this customer.");

  const now = new Date().toISOString();
  const applicationRef = generateApplicationRef();

  const loanRequirementsJson = JSON.stringify({
    loanAmount: offer.amount,
    loanPurpose: "PRE_APPROVED_OFFER",
    loanTerm: offer.termMonths,
    numberOfApplicants: 1,
  });

  const personalDetailsJson = JSON.stringify({
    firstName: "Noa",
    lastName: "Levi",
    dateOfBirth: "1988-04-12",
    nationalId,
    idIssueDate: "2018-01-01",
    nationality: "IL",
    maritalStatus: "MARRIED",
    dependents: 1,
    phoneNumber: "+972 50 123 4567",
    email: customerEmail,
    street: "12 Rothschild Boulevard",
    city: "Tel Aviv",
    postCode: "6688112",
    country: "Israel",
    monthsAtCurrentAddress: 48,
    previousAddresses: [],
    assistedByStaff: false,
    staffNationalId: "",
    preferredBranch: "",
  });

  const bankConnectionJson = JSON.stringify({
    connected: true,
    bankId: "leumi",
    bankName: "Bank Leumi",
    summary: { accountMasked: "**** **** **** 7421", avgBalance: 48250, transactions: 62 },
    applicant2: null,
  });

  const incomeEmploymentJson = JSON.stringify({
    employmentStatus: "FULL_TIME",
    employer: "Teva Pharmaceutical Industries",
    jobTitle: "Senior Operations Manager",
    employmentDuration: "Y5_PLUS",
    monthlyGrossIncome: 28000,
    monthlyNetIncome: 21500,
    otherIncome: 0,
    employments: [
      {
        employmentStatus: "FULL_TIME",
        employer: "Teva Pharmaceutical Industries",
        jobTitle: "Senior Operations Manager",
        employmentDuration: "Y5_PLUS",
        monthlyGrossIncome: 28000,
        monthlyNetIncome: 21500,
        otherIncome: 0,
      },
    ],
    applicant2: null,
  });

  const outgoingsJson = JSON.stringify({
    monthlyRent: 0,
    monthlyMortgage: 4200,
    monthlyLoans: 0,
    creditCardPayments: 800,
    otherMonthlyCommitments: 300,
    monthlyLivingExpenses: 5500,
  });

  const creditDeclarationsJson = JSON.stringify({
    hasDefaulted: false,
    hasBankruptcy: false,
    hasCCJ: false,
    hasPaymentPlan: false,
    creditScore: 780,
    applicant2: null,
  });

  const verifyIdJson = JSON.stringify({ idVerified: true, files: ["national_id_on_file.pdf"] });

  const directDebitJson = JSON.stringify({
    accountSource: "manual",
    accountHolderName: "Noa Levi",
    bankCode: "10",
    branchCode: "938",
    accountNumber: "07421639",
    preferredRepaymentDay: 1,
    confirmAuthorisation: true,
    bankName: "Bank Leumi",
    branchName: "Rothschild Branch",
    guarantorName: "",
    guarantorNationalId: "",
    guarantorRelationship: "",
    guarantorPhone: "",
    guarantorEmail: "",
  });

  const selectedProductJson = JSON.stringify({
    applicationRef,
    productCode: offer.productCode,
    productName: offer.productName,
    termMonths: offer.termMonths,
    monthlyRepayment: offer.monthlyRepayment,
    totalRepayable: offer.totalRepayable,
    apr: offer.annualInterestRate,
  });

  const affordabilityResultJson = JSON.stringify({
    passed: true,
    dti: 22.4,
    hti: 15.0,
    disposableIncome: 10700,
    monthlyRepaymentCapacity: 4280,
    calculatedMonthlyRepayment: offer.monthlyRepayment,
    failureReasons: [],
    riskCategory: "LOW",
    creditScoreCategory: "EXCELLENT",
  });

  const draft = {
    applicationRef,
    customerId,
    customerEmail,
    status: "IN_PROGRESS",
    currentSection: "personalDetails",
    applicationType: "PERSONAL",
    loanRequirementsJson,
    personalDetailsJson,
    bankConnectionJson,
    incomeEmploymentJson,
    outgoingsJson,
    creditDeclarationsJson,
    verifyIdJson,
    directDebitJson,
    selectedProductId: offer.productCode,
    selectedProductJson,
    affordabilityResultJson,
    createdAt: now,
    updatedAt: now,
  } as const;

  const completionPercentage = calculateCompletion({ ...draft, guarantorRequired: false } as any);

  const [created] = await db
    .insert(loanApplications)
    .values({ ...draft, completionPercentage })
    .returning();

  await consumePreApprovedOffer(db, nationalId);
  await loadCase(db, created);
  return c.json(created);
});

applications.put("/:appRef/section", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const { section, data } = await c.req.json<{ section: string; data: Record<string, unknown> }>();

  const app = await getByRef(db, appRef);
  const column = columnForSection(section);
  if (!column) throw new AppError(`Unknown section: ${section}`);
  const validated = await validateSectionData(db, app, section, data);

  const merged = { ...app, [column]: JSON.stringify(validated) };
  const newCurrentSection = nextSection(section, merged as any);
  const completionPercentage = calculateCompletion(merged as any);

  const { app: updated } = await runAction(c, appRef, {
    action: "save_section",
    extraColumns: { [column]: JSON.stringify(validated), currentSection: newCurrentSection, completionPercentage },
    waitUntil: waitUntilOf(c),
  });
  return c.json(updated);
});

applications.put("/:appRef/section-by-underwriter", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const { section, data } = await c.req.json<{ section: string; data: Record<string, unknown> }>();

  const app = await getByRef(db, appRef);
  const column = columnForSection(section);
  if (!column) throw new AppError(`Unknown section: ${section}`);
  const validated = await validateSectionData(db, app, section, data);

  const { app: updated } = await runAction(c, appRef, {
    action: "edit_section",
    input: { section },
    extraColumns: { [column]: JSON.stringify(validated) },
    waitUntil: waitUntilOf(c),
  });
  return c.json(updated);
});

// Queue status lists, the entitlement that opens each queue, and whether the org-scope and
// referral-visibility filters apply all come from the workflow definition (workflow-spec).
async function queueWhere(c: Context<AppEnv>, q: QueueDef) {
  const db = getDb(c.env.DB);
  return and(
    inArray(loanApplications.status, q.statuses),
    q.applyScope ? await caseScopeCondition(db, c.get("authUser"), c.get("authRole").scope) : undefined,
    q.hideReferredAbove ? await referralVisibility(db, c) : undefined,
  );
}

// Queue rows carry `workflow` (stage, owner, SLA clock). ?owner=me or ?owner=unassigned narrows the list.
async function queueRows(c: Context<AppEnv>, rows: (typeof loanApplications.$inferSelect)[]) {
  const withInfo = await withWorkflowInfo(getDb(c.env.DB), rows);
  const owner = c.req.query("owner");
  if (owner === "me") return withInfo.filter((r) => r.workflow?.assigneeUserId === c.get("authUser").id);
  if (owner === "unassigned") return withInfo.filter((r) => r.workflow?.assigneeUserId == null);
  return withInfo;
}

applications.get("/pipeline", async (c) => {
  const q = await resolveQueue(c, ["pipeline"]);
  const db = getDb(c.env.DB);
  return c.json(await queueRows(c, await db.select().from(loanApplications).where(await queueWhere(c, q)).orderBy(loanApplications.submittedAt)));
});

applications.get("/banker-queue", async (c) => {
  const q = await resolveQueue(c, ["banker-queue"]);
  const db = getDb(c.env.DB);
  return c.json(await queueRows(c, await db.select().from(loanApplications).where(await queueWhere(c, q)).orderBy(desc(loanApplications.updatedAt))));
});

// Broader than /pipeline and /banker-queue (which drive their respective list pages and
// deliberately exclude closed-out statuses) - the Home dashboard's stat tiles want a "Declined"
// count too, and IN_PROGRESS so a sent-back application can appear under "Pending Action Items".
applications.get("/home-stats", async (c) => {
  const q = await resolveQueue(c, ["home-stats-staff", "home-stats-banker"]);
  const db = getDb(c.env.DB);
  return c.json(await queueRows(c, await db.select().from(loanApplications).where(await queueWhere(c, q)).orderBy(desc(loanApplications.updatedAt))));
});

// Backs the Home dashboard's "Action Items" and "Recent Notifications" panels. There's no
// resolved/unresolved flag on underwriting_notes (it's an append-only log), so "action items" is
// approximated as document/clarification/send-back notes on applications still sitting in
// IN_PROGRESS — i.e. bounced back to the customer and not yet resubmitted.
applications.get("/staff-activity", async (c) => {
  // The activity queues include IN_PROGRESS for every role: a sent-back or document-requested
  // application waits on the customer in that status, which is exactly what "action items" surfaces.
  const q = await resolveQueue(c, ["activity-staff", "activity-banker"]);
  const db = getDb(c.env.DB);
  const apps = await db.select().from(loanApplications).where(await queueWhere(c, q));
  const appByRef = new Map(apps.map((a) => [a.applicationRef, a]));
  if (apps.length === 0) return c.json([]);

  const notes = await db
    .select()
    .from(underwritingNotes)
    .where(inArray(underwritingNotes.applicationRef, apps.map((a) => a.applicationRef)))
    .orderBy(desc(underwritingNotes.createdAt))
    .limit(50);

  const enriched = notes
    .map((n) => {
      const app = appByRef.get(n.applicationRef);
      if (!app) return null;
      return {
        id: n.id,
        applicationRef: n.applicationRef,
        applicationType: app.applicationType,
        customerEmail: app.customerEmail,
        personalDetailsJson: app.personalDetailsJson,
        companyDetailsJson: app.companyDetailsJson,
        applicationStatus: app.status,
        section: n.section,
        noteType: n.noteType,
        note: n.note,
        createdBy: n.createdBy,
        createdAt: n.createdAt,
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  return c.json(enriched);
});

// What the caller may approve on THIS case (role + the case's org unit / type), and where a
// referral from them would go. Drives the Decision tab.
applications.get("/:appRef/mandate", async (c) => {
  assertEntitlement(c, "mandates.view");
  const db = getDb(c.env.DB);
  const app = await getByRef(db, c.req.param("appRef"));
  await assertCaseVisible(db, c.get("authUser"), c.get("authRole").scope, app);
  const role = c.get("authRole");
  const mandate = await resolveMandate(db, role.code, app.orgUnitId, app.applicationType);
  const next = await nextRoleUp(db, role.rank);
  return c.json({
    limit: mandate.limit,
    nextRole: next ? { code: next.code, label: next.label } : null,
    // Non-null when the case is referred above the caller: every decision action is then refused.
    lockedTo: await referralLockLabel(db, app, role),
  });
});

applications.get("/:appRef/referrals", async (c) => {
  if (!isStaff(c)) throw new AppError("Forbidden.", 403);
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const app = await getByRef(db, appRef);
  await assertCaseVisible(db, c.get("authUser"), c.get("authRole").scope, app);
  const rows = await db.select().from(caseReferrals).where(eq(caseReferrals.applicationRef, appRef)).orderBy(caseReferrals.createdAt);
  return c.json(rows);
});

applications.get("/customer/:customerId", async (c) => {
  const db = getDb(c.env.DB);
  const customerId = Number(c.req.param("customerId"));
  assertOwnsCustomerId(c, customerId);
  const rows = await db
    .select()
    .from(loanApplications)
    .where(eq(loanApplications.customerId, customerId))
    .orderBy(desc(loanApplications.createdAt));
  return c.json(rows);
});

applications.get("/customer/:customerId/current", async (c) => {
  const db = getDb(c.env.DB);
  const customerId = Number(c.req.param("customerId"));
  assertOwnsCustomerId(c, customerId);
  const [app] = await db
    .select()
    .from(loanApplications)
    .where(eq(loanApplications.customerId, customerId))
    .orderBy(desc(loanApplications.updatedAt))
    .limit(1);
  if (!app) throw new AppError(`No application found for customer: ${customerId}`);
  return c.json(await withResolvedFormVersion(db, app));
});

applications.get("/:appRef/notes", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const rows = await db
    .select()
    .from(underwritingNotes)
    .where(eq(underwritingNotes.applicationRef, appRef))
    .orderBy(desc(underwritingNotes.createdAt));
  return c.json(rows);
});

applications.post("/:appRef/notes", async (c) => {
  const body = await c.req.json<{ section: string; note: string; noteType?: string }>();
  const noteType = body.noteType ?? "NOTE";
  // The note types that ask the customer for something are workflow actions of their own.
  const action = noteType === "CLARIFICATION_REQUEST" ? "request_clarification" : noteType === "DOCUMENT_REQUEST" ? "request_documents" : "add_note";
  const { note } = await runAction(c, c.req.param("appRef"), {
    action,
    input: { section: body.section, text: body.note, noteType },
    waitUntil: waitUntilOf(c),
  });
  return c.json(note);
});

// Generic GET must come after the more specific /:appRef/* routes above so Hono's router doesn't
// swallow e.g. /pipeline or /banker-queue as an appRef.
applications.get("/:appRef", async (c) => {
  const db = getDb(c.env.DB);
  const app = await getByRef(db, c.req.param("appRef"));
  await assertCaseVisible(db, c.get("authUser"), c.get("authRole").scope, app);
  return c.json(await withResolvedFormVersion(db, app));
});

applications.put("/:appRef/affordability-result", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const result = await c.req.json<Record<string, unknown>>();
  await getByRef(db, appRef);
  const [updated] = await db
    .update(loanApplications)
    .set({ affordabilityResultJson: JSON.stringify(result), updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();
  return c.json(updated);
});

// The routes below are the stable HTTP contract shared with the Java application service and driven by
// scripts/workflow-parity.mjs, so they stay. The Angular screens no longer call the decision and
// disbursement ones: they run actions through POST /api/workflow/cases/:ref/actions/:action instead
// (routes/workflow.ts), which applies exactly the same engine, guards, effects and audit.
//
// Every lifecycle and decision action below is a workflow transition: which statuses it is allowed
// from, who may do it, its guards (visibility, referral lock, mandate, ...) and its side effects
// (notes, notifications, emails, documents) are defined by the workflow definition, not here.
const act = (c: Context<AppEnv>, action: string, input?: TransitionInput, extraColumns?: Record<string, unknown>) =>
  runAction(c, c.req.param("appRef")!, { action, input, extraColumns, waitUntil: waitUntilOf(c) }).then((r) => r.app);

applications.post("/:appRef/withdraw", async (c) => c.json(await act(c, "withdraw")));
applications.post("/:appRef/cancel", async (c) => c.json(await act(c, "cancel")));
applications.post("/:appRef/submit", async (c) => c.json(await act(c, "submit")));

applications.post("/:appRef/select-product", async (c) => {
  const productData = await c.req.json<Record<string, unknown>>();
  return c.json(await act(c, "select_product", undefined, {
    selectedProductId: String(productData.productId ?? ""),
    selectedProductJson: JSON.stringify(productData),
  }));
});

applications.post("/:appRef/approve", async (c) => c.json(await act(c, "approve_conditional")));

applications.post("/:appRef/decline", async (c) => {
  const body = await c.req.json<{ reason: string }>();
  return c.json(await act(c, "decline", { reason: body.reason }));
});

applications.post("/:appRef/send-back", async (c) => {
  const body = await c.req.json<{ reason: string; requireGuarantor?: string }>();
  return c.json(await act(c, "send_back", { reason: body.reason, requireGuarantor: String(body.requireGuarantor).toLowerCase() === "true" }));
});

applications.post("/:appRef/approve-by-underwriter", async (c) => {
  const body = await c.req.json<{ approvedAmount?: string | number | null }>();
  // The Angular client sends this as a JS number (or omits it); ported from Java code that read
  // it as a String, so accept either shape defensively rather than assuming one.
  const approvedAmount = body.approvedAmount != null && String(body.approvedAmount).trim() !== "" ? Number(body.approvedAmount) : undefined;
  return c.json(await act(c, "approve", { approvedAmount }));
});

applications.post("/:appRef/refer-to-senior", async (c) => {
  const body = await c.req.json<{ reason: string; toRole?: string }>();
  return c.json(await act(c, "refer", { reason: body.reason, toRole: body.toRole }));
});

applications.post("/:appRef/disbursement/authorise", async (c) => c.json(await act(c, "authorise")));
applications.post("/:appRef/disbursement/second-check", async (c) => c.json(await act(c, "second_check")));

// generate-if-absent: computed once per application, persisted, never regenerated — stable
// across reloads and survives the underwriter editing other sections later.
applications.get("/:appRef/data-verification", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const app = await getByRef(db, appRef);
  if (app.dataVerificationJson) return c.json(JSON.parse(app.dataVerificationJson));

  const summary = generateDataVerification(app);
  await db
    .update(loanApplications)
    .set({ dataVerificationJson: JSON.stringify(summary), updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef));
  return c.json(summary);
});

applications.post("/:appRef/data-verification/resolve", async (c) => {
  assertEntitlement(c, "case.resolveVerification");
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const app = await getByRef(db, appRef);
  const body = await c.req.json<{ ruleKey: string; action: string; note?: string }>();

  const summary = app.dataVerificationJson ? JSON.parse(app.dataVerificationJson) : generateDataVerification(app);
  const resolved = resolveDataVerificationRule(summary, { ...body, reviewedBy: actorName(c) });

  await db
    .update(loanApplications)
    .set({ dataVerificationJson: JSON.stringify(resolved), updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef));
  return c.json(resolved);
});

applications.get("/:appRef/business-financials-analysis", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const app = await getByRef(db, appRef);
  if (app.businessFinancialsAnalysisJson) return c.json(JSON.parse(app.businessFinancialsAnalysisJson));

  const analysis = generateBusinessFinancialsAnalysis(app);
  await db
    .update(loanApplications)
    .set({ businessFinancialsAnalysisJson: JSON.stringify(analysis), updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef));
  return c.json(analysis);
});
