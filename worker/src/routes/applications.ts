import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppEnv, Env } from "../types";
import { getDb, type Db } from "../db/client";
import { loanApplications, underwritingNotes, mandateRules, generatedDocuments } from "../db/schema";
import { AppError } from "../lib/errors";
import {
  ALL_SECTIONS,
  columnForSection,
  calculateCompletion,
  nextSection,
  sectionLabel,
  generateApplicationRef,
} from "../lib/sections";
import { sendNotification, getPreferredLanguage } from "../lib/notifications";
import { sendTemplatedEmail } from "../lib/email";
import { greeting, loanPurpose } from "../lib/app-format";
import { getPreApprovedOffer, consumePreApprovedOffer } from "../lib/pre-approved";
import { getAutoApprovalThreshold } from "../lib/affordability-rules";
import { generateDataVerification, resolveDataVerificationRule } from "../lib/data-verification";
import { generateBusinessFinancialsAnalysis } from "../lib/business-financials";
import { generateApprovalLetterPdf } from "../lib/pdf/approval-letter";
import { requireAuth, assertRole } from "../middleware/auth";

export const applications = new Hono<AppEnv>();
applications.use("*", requireAuth);

const STAFF_ROLES = ["BANKER", "UNDERWRITER", "SENIOR_UNDERWRITER", "HEAD_OF_LENDING", "COO", "CEO", "ADMIN"];

const ACTIVE_STATUSES = ["DRAFT", "IN_PROGRESS"];
const PIPELINE_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR", "APPROVED"];
const BANKER_QUEUE_STATUSES = [
  "DRAFT",
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CONDITIONALLY_APPROVED",
  "REFERRED_TO_SENIOR",
  "APPROVED",
];
const CANCELLABLE_STATUSES = ["DRAFT", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR"];

async function getByRef(db: Db, appRef: string) {
  const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, appRef)).limit(1);
  if (!app) throw new AppError(`Application not found: ${appRef}`);
  return app;
}

async function addNote(
  db: Db,
  env: Env,
  appRef: string,
  section: string,
  note: string,
  noteType: string,
  createdBy: string
) {
  const app = await getByRef(db, appRef);
  const [saved] = await db
    .insert(underwritingNotes)
    .values({
      applicationRef: appRef,
      section,
      note,
      noteType,
      createdBy,
      createdAt: new Date().toISOString(),
    })
    .returning();

  if (noteType === "CLARIFICATION_REQUEST" || noteType === "DOCUMENT_REQUEST") {
    const isDocRequest = noteType === "DOCUMENT_REQUEST";
    const lang = await getPreferredLanguage(db, app.customerId);
    const title = lang === "he"
      ? (isDocRequest ? "נדרש מסמך עבור בקשת ההלוואה שלך" : "נדרש הבהרה בנוגע לבקשת ההלוואה שלך")
      : (isDocRequest ? "Document Required for Your Loan Application" : "Clarification Needed on Your Loan Application");
    const message = lang === "he"
      ? `${greeting(app, lang)} תודה שהגשת בקשה להלוואה פרטית עבור ${loanPurpose(app, lang)} בדיגילנד. ` +
        `צוות החיתום שלנו בודק את פרטי ${sectionLabel(section, lang)} שלך וזקוק ל` +
        `${isDocRequest ? "מסמך נוסף" : "הבהרה מסוימת"} לפני שנוכל להמשיך.\n\n` +
        `הערת החתם: ${note}\n\n` +
        `השלבים הבאים: ${
          isDocRequest
            ? "אנא התחבר/י לפורטל דיגילנד והעלה/י את המסמך הנדרש בעמוד המסמכים."
            : "אנא התחבר/י לפורטל דיגילנד, בדוק/י את הבקשה שלך, ועדכן/י את הפרק הרלוונטי."
        } לאחר מכן, הבקשה שלך תחזור לתור החיתום.`
      : `${greeting(app)} Thank you for applying for a personal loan for ${loanPurpose(app)} with DigiBank. ` +
        `Our underwriting team is reviewing your ${sectionLabel(section)} details and needs ` +
        `${isDocRequest ? "an additional document" : "some clarification"} before we can proceed.\n\n` +
        `Underwriter's note: ${note}\n\n` +
        `Next steps: ${
          isDocRequest
            ? "Please log in to your DigiBank portal and upload the requested document from the Documents section."
            : "Please log in to your DigiBank portal, review your application, and update the relevant section."
        } Once done, your application will be back in the underwriting queue.`;
    await sendNotification(db, app.customerId, title, message, "APPLICATION_UPDATE", appRef);
    await sendTemplatedEmail(db, env, noteType, app, {
      underwriterNote: note,
      sectionName: sectionLabel(section),
    });
  }

  return saved;
}

// Mirrors ApplicationService.generateFinalApprovalLetter — wrapped in a swallow-all try/catch,
// since document generation failure (including R2 not being enabled yet) should never block an
// underwriting decision.
async function generateFinalApprovalLetter(db: Db, env: Env, appRef: string) {
  try {
    if (!env.DOCUMENTS) return; // R2 not yet enabled on this account — degrade silently
    const app = await getByRef(db, appRef);
    if (!app.selectedProductJson || !app.loanRequirementsJson) return;

    const product = JSON.parse(app.selectedProductJson);
    const loan = JSON.parse(app.loanRequirementsJson);
    const personal = app.personalDetailsJson ? JSON.parse(app.personalDetailsJson) : null;
    const customerName = personal ? `${personal.firstName ?? ""} ${personal.lastName ?? ""}`.trim() : app.customerEmail;
    const approvedAmount = app.approvedAmount ?? loan.loanAmount ?? 0;

    const pdfBytes = await generateApprovalLetterPdf(
      {
        applicationRef: app.applicationRef,
        customerName,
        loanAmount: approvedAmount,
        productName: product.productName ?? "",
        interestRate: product.interestRate ?? product.apr ?? 0,
        termMonths: product.termMonths ?? 0,
        monthlyRepayment: product.monthlyRepayment ?? 0,
      },
      true
    );

    const key = `generated/${app.applicationRef}/FINAL_APPROVAL_LETTER_${crypto.randomUUID()}.pdf`;
    await env.DOCUMENTS.put(key, pdfBytes, { httpMetadata: { contentType: "application/pdf" } });
    await db.insert(generatedDocuments).values({
      applicationRef: app.applicationRef,
      customerId: app.customerId,
      documentType: "FINAL_APPROVAL_LETTER",
      documentName: "Final Approval Letter",
      filePath: key,
      fileSize: pdfBytes.byteLength,
      mimeType: "application/pdf",
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("generateFinalApprovalLetter failed (non-fatal):", e);
  }
}

async function approveApplicationByUnderwriter(
  db: Db,
  env: Env,
  appRef: string,
  reviewedBy: string,
  approvedAmount: number | null
) {
  const app = await getByRef(db, appRef);
  const [updated] = await db
    .update(loanApplications)
    .set({ status: "APPROVED", approvedAmount, updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();

  await addNote(db, env, appRef, "general", "Application approved.", "DECISION_APPROVED", reviewedBy);
  {
    const lang = await getPreferredLanguage(db, app.customerId);
    const title = lang === "he" ? "בקשת ההלוואה שלך אושרה!" : "Your Loan Application Has Been Approved!";
    const message = lang === "he"
      ? `${greeting(app, lang)} מזל טוב! בקשתך להלוואה פרטית עבור ${loanPurpose(app, lang)} ` +
        "נבדקה ואושרה על ידי צוות החיתום שלנו.\n\n" +
        "השלבים הבאים: אנא התחבר/י לפורטל דיגילנד לצפייה במכתב האישור ובמסמכי הסכם ההלוואה בעמוד המסמכים."
      : `${greeting(app)} Congratulations! Your personal loan application for ${loanPurpose(app)} ` +
        "has been reviewed and approved by our underwriting team.\n\n" +
        "Next steps: Please log in to your DigiBank portal to view your approval letter and loan agreement documents in the Documents section.";
    await sendNotification(db, app.customerId, title, message, "APPROVAL", appRef);
  }
  await sendTemplatedEmail(db, env, "DECISION_APPROVED", app, {
    approvedAmount: approvedAmount != null ? String(approvedAmount) : "",
    reviewedBy,
  });
  await generateFinalApprovalLetter(db, env, appRef);
  return updated;
}

async function maybeAutoApprove(db: Db, env: Env, app: typeof loanApplications.$inferSelect) {
  try {
    // Business loans always go to manual underwriter review for now — the auto-approval threshold
    // is sized for personal-loan amounts/risk and reads loanRequirementsJson, which business
    // applications never populate.
    if (app.applicationType === "BUSINESS") return;
    if (!app.affordabilityResultJson) return;
    const result = JSON.parse(app.affordabilityResultJson);
    if (result.passed !== true) return;

    const personal = app.personalDetailsJson ? JSON.parse(app.personalDetailsJson) : null;
    const jointApplication = !!(personal && personal.applicant2 != null);

    const threshold = await getAutoApprovalThreshold(db, jointApplication);
    if (threshold == null) return;

    const loan = app.loanRequirementsJson ? JSON.parse(app.loanRequirementsJson) : null;
    const loanAmount = Number(loan?.loanAmount ?? 0);
    if (loanAmount > threshold) return;

    await approveApplicationByUnderwriter(db, env, app.applicationRef, "System (Auto-Approval)", loanAmount);
  } catch (e) {
    // Auto-approval is a convenience; failures fall back to manual underwriter review.
    console.error("maybeAutoApprove failed (non-fatal):", e);
  }
}

applications.post("/start", async (c) => {
  const db = getDb(c.env.DB);
  const { customerId, customerEmail } = await c.req.json<{ customerId: number; customerEmail: string }>();

  const [existing] = await db
    .select()
    .from(loanApplications)
    .where(and(eq(loanApplications.customerId, customerId), inArray(loanApplications.status, ACTIVE_STATUSES)))
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
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return c.json(created);
});

applications.post("/start-business", async (c) => {
  const db = getDb(c.env.DB);
  const { customerId, customerEmail } = await c.req.json<{ customerId: number; customerEmail: string }>();

  const [existing] = await db
    .select()
    .from(loanApplications)
    .where(and(eq(loanApplications.customerId, customerId), inArray(loanApplications.status, ACTIVE_STATUSES)))
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
      createdAt: now,
      updatedAt: now,
    })
    .returning();
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
    loanPurpose: "Pre-Approved Offer",
    loanTerm: offer.termMonths,
    numberOfApplicants: 1,
  });

  const personalDetailsJson = JSON.stringify({
    firstName: "Noa",
    lastName: "Levi",
    dateOfBirth: "1988-04-12",
    nationalId,
    idIssueDate: "2018-01-01",
    nationality: "Israeli",
    maritalStatus: "Married",
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
    employmentStatus: "Employed",
    employer: "Teva Pharmaceutical Industries",
    jobTitle: "Senior Operations Manager",
    employmentDuration: "6 years",
    monthlyGrossIncome: 28000,
    monthlyNetIncome: 21500,
    otherIncome: 0,
    employments: [
      {
        employmentStatus: "Employed",
        employer: "Teva Pharmaceutical Industries",
        jobTitle: "Senior Operations Manager",
        employmentDuration: "6 years",
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
  return c.json(created);
});

applications.put("/:appRef/section", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const { section, data } = await c.req.json<{ section: string; data: Record<string, unknown> }>();

  const app = await getByRef(db, appRef);
  const column = columnForSection(section);
  if (!column) throw new AppError(`Unknown section: ${section}`);

  const merged = { ...app, [column]: JSON.stringify(data) };
  const newCurrentSection = nextSection(section, merged as any);
  const completionPercentage = calculateCompletion(merged as any);

  const [updated] = await db
    .update(loanApplications)
    .set({
      [column]: JSON.stringify(data),
      status: "IN_PROGRESS",
      currentSection: newCurrentSection,
      completionPercentage,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();
  return c.json(updated);
});

applications.put("/:appRef/section-by-underwriter", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const editedBy = c.req.query("editedBy") ?? "Staff";
  const { section, data } = await c.req.json<{ section: string; data: Record<string, unknown> }>();

  await getByRef(db, appRef);
  const column = columnForSection(section);
  if (!column) throw new AppError(`Unknown section: ${section}`);

  const [updated] = await db
    .update(loanApplications)
    .set({ [column]: JSON.stringify(data), updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();

  await addNote(db, c.env, appRef, section, "Section edited by staff member.", "EDIT", editedBy);
  return c.json(updated);
});

applications.get("/pipeline", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(loanApplications)
    .where(inArray(loanApplications.status, PIPELINE_STATUSES))
    .orderBy(loanApplications.submittedAt);
  return c.json(rows);
});

applications.get("/banker-queue", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(loanApplications)
    .where(inArray(loanApplications.status, BANKER_QUEUE_STATUSES))
    .orderBy(desc(loanApplications.updatedAt));
  return c.json(rows);
});

// Broader than /pipeline and /banker-queue (which drive their respective list pages and
// deliberately exclude closed-out statuses) — the Home dashboard's stat tiles want a "Declined"
// count too, so this is a dedicated fetch rather than reusing either.
applications.get("/home-stats", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const role = c.get("authUser").role;
  // IN_PROGRESS included for every role (not just banker) so the "Pending Action Items" tile's
  // count/amount — cross-referenced against these rows — can actually include a sent-back
  // application, matching what /staff-activity already surfaces for the same tile.
  const statuses = role === "BANKER" ? [...BANKER_QUEUE_STATUSES, "DECLINED"] : [...PIPELINE_STATUSES, "DECLINED", "IN_PROGRESS"];
  const rows = await db
    .select()
    .from(loanApplications)
    .where(inArray(loanApplications.status, statuses))
    .orderBy(desc(loanApplications.updatedAt));
  return c.json(rows);
});

// Backs the Home dashboard's "Action Items" and "Recent Notifications" panels. There's no
// resolved/unresolved flag on underwriting_notes (it's an append-only log), so "action items" is
// approximated as document/clarification/send-back notes on applications still sitting in
// IN_PROGRESS — i.e. bounced back to the customer and not yet resubmitted.
applications.get("/staff-activity", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const role = c.get("authUser").role;
  // IN_PROGRESS is explicitly included even for non-banker roles (PIPELINE_STATUSES normally
  // excludes it) — a sent-back/document-requested application moves to IN_PROGRESS while it
  // waits on the customer, which is exactly the case "action items" needs to surface. Leaving it
  // out here would make every action item invisible the moment it's created.
  const statuses = role === "BANKER" ? BANKER_QUEUE_STATUSES : [...PIPELINE_STATUSES, "IN_PROGRESS"];
  const apps = await db
    .select()
    .from(loanApplications)
    .where(inArray(loanApplications.status, statuses));
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

applications.get("/mandate-rules", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const [rules] = await db.select().from(mandateRules).where(eq(mandateRules.id, 1)).limit(1);
  return c.json(rules);
});

applications.put("/mandate-rules", async (c) => {
  assertRole(c, "ADMIN");
  const db = getDb(c.env.DB);
  const body = await c.req.json<Record<string, number>>();
  const [updated] = await db
    .update(mandateRules)
    .set({
      underwriterLimit: body.underwriterLimit,
      seniorUnderwriterLimit: body.seniorUnderwriterLimit,
      headOfLendingLimit: body.headOfLendingLimit,
      cooLimit: body.cooLimit,
      ceoLimit: body.ceoLimit,
    })
    .where(eq(mandateRules.id, 1))
    .returning();
  return c.json(updated);
});

applications.get("/customer/:customerId", async (c) => {
  const db = getDb(c.env.DB);
  const customerId = Number(c.req.param("customerId"));
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
  const [app] = await db
    .select()
    .from(loanApplications)
    .where(eq(loanApplications.customerId, customerId))
    .orderBy(desc(loanApplications.updatedAt))
    .limit(1);
  if (!app) throw new AppError(`No application found for customer: ${customerId}`);
  return c.json(app);
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
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const body = await c.req.json<{ section: string; note: string; noteType?: string; createdBy: string }>();
  const saved = await addNote(db, c.env, appRef, body.section, body.note, body.noteType ?? "NOTE", body.createdBy);
  return c.json(saved);
});

// Generic GET must come after the more specific /:appRef/* routes above so Hono's router doesn't
// swallow e.g. /pipeline or /banker-queue as an appRef.
applications.get("/:appRef", async (c) => {
  const db = getDb(c.env.DB);
  const app = await getByRef(db, c.req.param("appRef"));
  return c.json(app);
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

applications.post("/:appRef/withdraw", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const app = await getByRef(db, appRef);
  if (app.status !== "SUBMITTED" && app.status !== "UNDER_REVIEW") {
    throw new AppError(`Only submitted applications can be pulled back: ${appRef}`);
  }
  const [updated] = await db
    .update(loanApplications)
    .set({ status: "IN_PROGRESS", currentSection: "reviewSubmit", updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();
  return c.json(updated);
});

applications.post("/:appRef/cancel", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const app = await getByRef(db, appRef);
  if (!CANCELLABLE_STATUSES.includes(app.status)) {
    throw new AppError(`Application cannot be cancelled in its current status: ${appRef}`);
  }
  const [updated] = await db
    .update(loanApplications)
    .set({ status: "WITHDRAWN", updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();
  return c.json(updated);
});

applications.post("/:appRef/submit", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  await getByRef(db, appRef);
  const now = new Date().toISOString();
  const [updated] = await db
    .update(loanApplications)
    .set({ status: "SUBMITTED", submittedAt: now, completionPercentage: 100, updatedAt: now })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();
  await sendTemplatedEmail(db, c.env, "SUBMITTED", updated, {});
  return c.json(updated);
});

applications.post("/:appRef/select-product", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const productData = await c.req.json<Record<string, unknown>>();
  await getByRef(db, appRef);

  const [updated] = await db
    .update(loanApplications)
    .set({
      selectedProductId: String(productData.productId ?? ""),
      selectedProductJson: JSON.stringify(productData),
      status: "UNDER_REVIEW",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();

  await maybeAutoApprove(db, c.env, updated);
  const [fresh] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, appRef)).limit(1);
  return c.json(fresh);
});

applications.post("/:appRef/approve", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const app = await getByRef(db, appRef);
  if (app.status !== "APPROVED") {
    const [updated] = await db
      .update(loanApplications)
      .set({ status: "CONDITIONALLY_APPROVED", updatedAt: new Date().toISOString() })
      .where(eq(loanApplications.applicationRef, appRef))
      .returning();
    return c.json(updated);
  }
  return c.json(app);
});

applications.post("/:appRef/decline", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const body = await c.req.json<{ reason: string; reviewedBy: string }>();
  const app = await getByRef(db, appRef);
  const [updated] = await db
    .update(loanApplications)
    .set({ status: "DECLINED", updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();

  await addNote(db, c.env, appRef, "general", body.reason, "DECISION_DECLINED", body.reviewedBy);
  {
    const lang = await getPreferredLanguage(db, app.customerId);
    const title = lang === "he" ? "עדכון לגבי בקשת ההלוואה שלך" : "Update on Your Loan Application";
    const message = lang === "he"
      ? `${greeting(app, lang)} תודה שהגשת בקשה להלוואה פרטית עבור ${loanPurpose(app, lang)} בדיגילנד. ` +
        "לאחר בדיקה מעמיקה, לא נוכל לאשר את בקשתך בשלב זה.\n\n" +
        `סיבה: ${body.reason}\n\n` +
        "השלבים הבאים: מוזמן/ת ליצור קשר עם יועץ דיגילנד שלך לפרטים נוספים, או להגיש בקשה חדשה בעתיד אם הנסיבות ישתנו."
      : `${greeting(app)} Thank you for applying for a personal loan for ${loanPurpose(app)} with DigiBank. ` +
        "After careful review, we are unable to approve your application at this time.\n\n" +
        `Reason: ${body.reason}\n\n` +
        "Next steps: You're welcome to contact your DigiBank advisor for more detail, or reapply in the future if your circumstances change.";
    await sendNotification(db, app.customerId, title, message, "APPLICATION_UPDATE", appRef);
  }
  await sendTemplatedEmail(db, c.env, "DECISION_DECLINED", app, {
    declineReason: body.reason,
    reviewedBy: body.reviewedBy,
  });
  return c.json(updated);
});

applications.post("/:appRef/send-back", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const body = await c.req.json<{ reason: string; reviewedBy: string; requireGuarantor?: string }>();
  const requireGuarantor = String(body.requireGuarantor).toLowerCase() === "true";

  const app = await getByRef(db, appRef);
  const guarantorNewlyNeeded = requireGuarantor && app.guarantorDetailsJson == null;

  const [updated] = await db
    .update(loanApplications)
    .set({
      status: "IN_PROGRESS",
      guarantorRequired: requireGuarantor ? true : app.guarantorRequired,
      currentSection: guarantorNewlyNeeded ? "guarantorDetails" : "reviewSubmit",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();

  await addNote(db, c.env, appRef, "general", body.reason, "SEND_BACK", body.reviewedBy);

  const lang = await getPreferredLanguage(db, app.customerId);
  const guarantorNote = guarantorNewlyNeeded
    ? (lang === "he"
        ? " כעת נדרש ערב עבור בקשה זו — אנא מלא/י את פרק פרטי הערב החדש, כולל מסמך תומך עבור הערב, לפני ההגשה מחדש."
        : " A guarantor is now required for this application — please complete the new Guarantor Details section, " +
          "including a supporting document for your guarantor, before resubmitting.")
    : "";
  const title = lang === "he" ? "נדרשת פעולה בבקשת ההלוואה שלך" : "Action Needed on Your Loan Application";
  const message = lang === "he"
    ? `${greeting(app, lang)} תודה שהגשת בקשה להלוואה פרטית עבור ${loanPurpose(app, lang)} בדיגילנד. ` +
      "צוות החיתום שלנו בדק את בקשתך והחזיר אותה לצורך פרטים נוספים לפני שנוכל להמשיך.\n\n" +
      `הערת החתם: ${body.reason}\n\n` +
      "השלבים הבאים: אנא התחבר/י לפורטל דיגילנד, עיין/י במשוב על בקשתך, עדכן/י את הפרק/ים הרלוונטיים, " +
      "העלה/י מסמכים תומכים אם התבקש, והגש/י מחדש לבדיקה." +
      guarantorNote
    : `${greeting(app)} Thank you for applying for a personal loan for ${loanPurpose(app)} with DigiBank. ` +
      "Our underwriting team has reviewed your application and sent it back for a few additional details before we can proceed.\n\n" +
      `Underwriter's note: ${body.reason}\n\n` +
      "Next steps: Please log in to your DigiBank portal, review the feedback on your application, update the relevant section(s), " +
      "upload any supporting documents if requested, and resubmit for review." +
      guarantorNote;
  await sendNotification(db, app.customerId, title, message, "APPLICATION_UPDATE", appRef);
  await sendTemplatedEmail(db, c.env, "SEND_BACK", app, {
    sendBackReason: body.reason,
    reviewedBy: body.reviewedBy,
    guarantorRequiredNote: guarantorNote,
  });
  return c.json(updated);
});

applications.post("/:appRef/approve-by-underwriter", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const body = await c.req.json<{ reviewedBy: string; approvedAmount?: string | number | null }>();
  // The Angular client sends this as a JS number (or omits it); ported from Java code that read
  // it as a String, so accept either shape defensively rather than assuming one.
  const approvedAmount =
    body.approvedAmount != null && String(body.approvedAmount).trim() !== "" ? Number(body.approvedAmount) : null;
  const updated = await approveApplicationByUnderwriter(db, c.env, appRef, body.reviewedBy, approvedAmount);
  return c.json(updated);
});

applications.post("/:appRef/refer-to-senior", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const body = await c.req.json<{ reason: string; reviewedBy: string }>();
  await getByRef(db, appRef);
  const [updated] = await db
    .update(loanApplications)
    .set({ status: "REFERRED_TO_SENIOR", updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();
  await addNote(db, c.env, appRef, "general", body.reason, "REFERRED_TO_SENIOR", body.reviewedBy);
  return c.json(updated);
});

applications.post("/:appRef/disbursement/authorise", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const body = await c.req.json<{ reviewedBy: string }>();
  const app = await getByRef(db, appRef);
  const [updated] = await db
    .update(loanApplications)
    .set({ disbursementStatus: "FUNDS_RELEASED", updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();
  await addNote(db, c.env, appRef, "disbursement", "Fund release authorised.", "DISBURSEMENT_AUTHORISED", body.reviewedBy);
  {
    const lang = await getPreferredLanguage(db, app.customerId);
    const title = lang === "he" ? "כספי ההלוואה שלך שוחררו" : "Your Loan Funds Have Been Released";
    const message = lang === "he"
      ? `${greeting(app, lang)} בשורה טובה — כספי ההלוואה שלך עבור ${loanPurpose(app, lang)} אושרו לשחרור ויועברו לחשבון שציינת בקרוב.`
      : `${greeting(app)} Great news — your loan funds for ${loanPurpose(app)} have been authorised for release and will be transferred to your nominated account shortly.`;
    await sendNotification(db, app.customerId, title, message, "APPROVAL", appRef);
  }
  await sendTemplatedEmail(db, c.env, "DISBURSEMENT_AUTHORISED", app, { reviewedBy: body.reviewedBy });
  return c.json(updated);
});

applications.post("/:appRef/disbursement/second-check", async (c) => {
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const body = await c.req.json<{ reviewedBy: string }>();
  await getByRef(db, appRef);
  const [updated] = await db
    .update(loanApplications)
    .set({ disbursementStatus: "SECOND_CHECK_PENDING", updatedAt: new Date().toISOString() })
    .where(eq(loanApplications.applicationRef, appRef))
    .returning();
  await addNote(db, c.env, appRef, "disbursement", "Submitted for second checks before fund release.", "SECOND_CHECK_PENDING", body.reviewedBy);
  return c.json(updated);
});

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
  assertRole(c, ...STAFF_ROLES);
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const app = await getByRef(db, appRef);
  const body = await c.req.json<{ ruleKey: string; action: string; note?: string; reviewedBy: string }>();

  const summary = app.dataVerificationJson ? JSON.parse(app.dataVerificationJson) : generateDataVerification(app);
  const resolved = resolveDataVerificationRule(summary, body);

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
