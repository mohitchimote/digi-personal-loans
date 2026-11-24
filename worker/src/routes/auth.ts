import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { users, faqs } from "../db/schema";
import { success, fail } from "../lib/api-response";
import { AppError } from "../lib/errors";
import { generateAndAssignOtp, verifyOtpForUser, OTP_VALIDITY_SECONDS } from "../lib/otp";
import { buildAuthResponse, toCustomerProfile } from "../lib/user-mappers";
import { requireAuth, requireRole, requireEntitlement, requireLender, optionalAuth, publicLender, hostLender, lenderCodeFor } from "../middleware/auth";
import { findLoginAccounts, findUsersByEmail, resolveRegistrationLender, updateUserRow, countActiveLenders, getLenderById } from "../lib/lenders";
import { inLender } from "../lib/lender-scope";
import { recordAudit } from "../lib/audit";

export const auth = new Hono<AppEnv>();

const nationalIdSchema = z.string().regex(/^\d{9}$/, "National ID must be 9 digits");

// Optional everywhere: with one active lender it is implied; with several, the customer says which.
const lenderCodeSchema = z.string().trim().max(32).optional().nullable();

const registerSchema = z.object({
  lenderCode: lenderCodeSchema,
  email: z.string().email("Must be a valid email address"),
  nationalId: nationalIdSchema,
  idIssueDate: z.string().refine((v) => new Date(v) < new Date(), "ID issue date must be in the past"),
  fullName: z.string().min(1, "Full name is required"),
  phoneNumber: z.string().optional().nullable(),
  accountType: z.enum(["PERSONAL", "BUSINESS"]).default("PERSONAL"),
  companyName: z.string().optional().nullable(),
  companyRegistrationNumber: z.string().optional().nullable(),
  companyIndustry: z.string().optional().nullable(),
  companyFoundedYear: z.number().int().optional().nullable(),
});

async function createUser(
  db: ReturnType<typeof getDb>,
  lenderId: number,
  body: z.infer<typeof registerSchema>,
  opts: { enabled: boolean; emailVerified: boolean }
) {
  // Unique per lender: the same e-mail or National ID may hold a separate account at another lender.
  if ((await db.select().from(users).where(and(eq(users.lenderId, lenderId), eq(users.email, body.email))).limit(1)).length > 0) {
    throw new AppError("An account with this email address already exists.");
  }
  if ((await db.select().from(users).where(and(eq(users.lenderId, lenderId), eq(users.nationalId, body.nationalId))).limit(1)).length > 0) {
    throw new AppError("An account with this National ID already exists.");
  }

  const isBusiness = body.accountType === "BUSINESS";
  if (isBusiness) {
    if (!body.companyName?.trim()) throw new AppError("Company name is required for a business account.");
    if (!body.companyRegistrationNumber?.trim())
      throw new AppError("Company registration number is required for a business account.");
  }

  const [saved] = await db
    .insert(users)
    .values({
      lenderId,
      uuid: crypto.randomUUID(),
      email: body.email,
      nationalId: body.nationalId,
      idIssueDate: body.idIssueDate,
      fullName: body.fullName,
      phoneNumber: body.phoneNumber ?? null,
      role: isBusiness ? "BUSINESS_OWNER" : "CUSTOMER",
      createdAt: new Date().toISOString(),
      enabled: opts.enabled,
      emailVerified: opts.emailVerified,
      companyName: isBusiness ? body.companyName : null,
      companyRegistrationNumber: isBusiness ? body.companyRegistrationNumber : null,
      companyIndustry: isBusiness ? (body.companyIndustry ?? null) : null,
      companyFoundedYear: isBusiness ? (body.companyFoundedYear ?? null) : null,
    })
    .returning();
  return saved;
}

// The registration being verified. The same e-mail can be registered at two lenders, so when it is
// and no lender code was given the customer has to say which one they mean.
async function pendingRegistration(db: ReturnType<typeof getDb>, email: string, lenderCode?: string | null, hostLenderId: number | null = null) {
  const matches = await findUsersByEmail(db, email, lenderCode, hostLenderId);
  const pending = matches.filter((u) => !u.emailVerified);
  const pool = pending.length ? pending : matches;
  if (pool.length === 0) throw new AppError("No registration found for this email.");
  if (pool.length > 1) throw new AppError("Please enter your lender code.");
  return pool[0];
}

// Which lender this address is for, so the login and registration pages know whether to ask for a
// lender code at all: never on a lender's own address, and not when there is only one lender.
const LOGIN_FAILED = "That code is incorrect or has expired. Please request a new one.";
/** A code shaped like a real one, for answers about accounts that do not exist or may not sign in here. */
const decoyOtp = () => (crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).toString().padStart(6, "0");

auth.get("/context", async (c) => {
  const db = getDb(c.env.DB);
  const byHost = await hostLender(c, db);
  return c.json({
    lender: byHost ? { code: byHost.code, name: byHost.name } : null,
    hostMapped: !!byHost,
    choiceNeeded: !byHost && (await countActiveLenders(db)) > 1,
  });
});

auth.get("/faqs", optionalAuth, async (c) => {
  const db = getDb(c.env.DB);
  // Public, like branding: the lender comes from ?lender=CODE (or is the only active one).
  const lenderId = await publicLender(c, db);
  if (lenderId == null) return c.json([]);
  const rows = await db.select().from(faqs).where(inLender(faqs, lenderId)).orderBy(asc(faqs.category), asc(faqs.displayOrder));
  return c.json(rows);
});

auth.post("/register", zValidator("json", registerSchema), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const lender = await resolveRegistrationLender(db, await lenderCodeFor(c, db, body.lenderCode), (await hostLender(c, db))?.id ?? null);
  const saved = await createUser(db, lender.id, body, { enabled: false, emailVerified: false });
  const demoOtp = await generateAndAssignOtp(db, saved);
  return success(
    c,
    "Almost there — please verify your email to finish creating your account.",
    { email: saved.email, lenderCode: lender.code, demoOtp, otpExpiresInSeconds: OTP_VALIDITY_SECONDS },
    201
  );
});

// Banker-assisted registration: identity already confirmed in person/by phone, so the account
// is created enabled/verified straight away — no email-OTP round trip.
auth.post("/register-by-staff", requireAuth, requireEntitlement("case.actAsCustomer"), zValidator("json", registerSchema), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  // Assisted registration always lands in the staff member's own lender, whatever the body says.
  const saved = await createUser(db, requireLender(c), body, { enabled: true, emailVerified: true });
  const response = await buildAuthResponse(db, saved, c.env.JWT_SECRET);
  return success(c, "Customer account created.", response, 201);
});

auth.post(
  "/register/verify-otp",
  zValidator("json", z.object({ email: z.string().email(), otp: z.string().min(1), lenderCode: lenderCodeSchema })),
  async (c) => {
    const db = getDb(c.env.DB);
    const { email, otp, lenderCode } = c.req.valid("json");
    const user = await pendingRegistration(db, email, await lenderCodeFor(c, db, lenderCode), (await hostLender(c, db))?.id ?? null);
    if (user.emailVerified) throw new AppError("This account is already verified.");

    const verified = await verifyOtpForUser(db, user, otp);
    const [updated] = await updateUserRow(db, verified, { emailVerified: true, enabled: true, lastLogin: new Date().toISOString() });

    const response = await buildAuthResponse(db, updated, c.env.JWT_SECRET);
    return success(c, "Registration successful. Welcome to DigiBank.", response);
  }
);

auth.post("/register/resend-otp", zValidator("json", z.object({ email: z.string().email(), lenderCode: lenderCodeSchema })), async (c) => {
  const db = getDb(c.env.DB);
  const { email, lenderCode } = c.req.valid("json");
  const user = await pendingRegistration(db, email, await lenderCodeFor(c, db, lenderCode), (await hostLender(c, db))?.id ?? null);
  if (user.emailVerified) throw new AppError("This account is already verified.");

  const demoOtp = await generateAndAssignOtp(db, user);
  return success(c, "A new OTP has been generated.", {
    email: user.email,
    demoOtp,
    otpExpiresInSeconds: OTP_VALIDITY_SECONDS,
  });
});

// A National ID can sign in to one account per lender. With a lender code (or on a lender's own
// address) the account is that lender's; without one, a single match is used and several matches
// ask the user to choose.
//
// What this endpoint says must not reveal whether an account exists: an unknown ID, a disabled
// account, an account of a lender that is only reachable at its own address, and a real account all
// get the same success-shaped answer (the code of the decoy never works). The one thing that has to
// differ is the picker for an ID that has accounts at several lenders reachable from this address,
// which lists only those lenders; lenders with their own address never appear in it.
auth.post("/login/request-otp", zValidator("json", z.object({ nationalId: nationalIdSchema, lenderCode: lenderCodeSchema })), async (c) => {
  const db = getDb(c.env.DB);
  const { nationalId, lenderCode } = c.req.valid("json");
  const hostL = await hostLender(c, db);
  const code = hostL?.code ?? (lenderCode?.trim() || undefined);
  const accounts = (await findLoginAccounts(db, nationalId, code, hostL?.id ?? null)).filter((a) => a.user.enabled);
  if (accounts.length > 1) {
    return success(c, "Choose which lender to sign in to.", {
      requiresLenderChoice: true,
      lenders: accounts.map((a) => ({ code: a.lender?.code ?? null, name: a.lender?.name ?? "Platform administration" })),
    });
  }
  const demoOtp = accounts.length === 1 ? await generateAndAssignOtp(db, accounts[0].user) : decoyOtp();
  return success(c, "A login code has been generated.", { nationalId, lenderCode: code ?? null, demoOtp, otpExpiresInSeconds: OTP_VALIDITY_SECONDS });
});

// Unlike every other auth endpoint (which returns 400 on business-rule errors), the Java
// controller catches IllegalArgumentException here and always returns 401 — replicated below by
// deliberately not letting AppError's own status escape this handler.
auth.post(
  "/login/verify-otp",
  zValidator("json", z.object({ nationalId: nationalIdSchema, otp: z.string().min(1), lenderCode: lenderCodeSchema })),
  async (c) => {
    const db = getDb(c.env.DB);
    const { nationalId, otp, lenderCode } = c.req.valid("json");
    try {
      const hostL = await hostLender(c, db);
      const accounts = (await findLoginAccounts(db, nationalId, await lenderCodeFor(c, db, lenderCode), hostL?.id ?? null)).filter((a) => a.user.enabled);
      // No account, a disabled one, an ambiguous one and a wrong code all fail the same way.
      if (accounts.length !== 1) throw new AppError(LOGIN_FAILED);
      const { user } = accounts[0];

      const verified = await verifyOtpForUser(db, user, otp);
      const previousLogin = verified.lastLogin; // captured before this login overwrites it below
      const [updated] = await updateUserRow(db, verified, { lastLogin: new Date().toISOString() });

      const response = { ...(await buildAuthResponse(db, updated, c.env.JWT_SECRET)), previousLogin };
      return success(c, "Login successful.", response);
    } catch {
      // One message for every failure (missing, expired, locked or wrong code), so this cannot be
      // used to find out which National IDs have an account.
      return fail(c, LOGIN_FAILED, 401);
    }
  }
);

// Banker-only: lets a Banker assisting a customer prefill wizard sections with data the customer
// already gave at account creation — never the Banker's own identity.
auth.get("/customer-profile/:id", requireAuth, requireEntitlement("case.actAsCustomer"), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [user] = await db.select().from(users).where(and(eq(users.lenderId, requireLender(c)), eq(users.id, id))).limit(1);
  if (!user) return fail(c, "Customer not found.", 404);
  return success(c, "OK", toCustomerProfile(user));
});

auth.get("/validate", requireAuth, async (c) => {
  const user = c.get("authUser");
  return success(c, "Token is valid.", user.uuid);
});

// S2 (ARCHITECTURE_REVIEW_GAPS.md) — no logout/session-invalidation endpoint existed before this;
// "logging out" was purely a client-side token discard, so a copied/leaked token stayed valid until
// its natural 24h expiry regardless. Bumping sessionsRevokedAt invalidates this token (and every
// other one already issued for this user) on its very next use.
auth.post("/logout", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get("authUser");
  // Leaving an "enter as" view must not sign out the user being viewed.
  if (c.get("actingUser")) return success(c, "Logged out.", null);
  await updateUserRow(db, user, { sessionsRevokedAt: new Date().toISOString() });
  return success(c, "Logged out.", null);
});

// End an "enter as" session: a fresh session for the administrator (inside the lender, for a platform admin).
auth.post("/exit-impersonation", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const admin = c.get("actingUser");
  if (!admin) throw new AppError("You are not viewing as another user.", 400);
  const target = c.get("authUser");
  const lenderId = c.get("lenderId");
  await recordAudit(db, { lenderId: target.lenderId!, eventType: "USER_VIEW_AS_ENDED", subjectType: "User", subjectId: String(target.id), actor: admin.fullName?.trim() || admin.email, actorRole: admin.role });
  const inside = admin.lenderId == null && lenderId != null ? await getLenderById(db, lenderId) : null;
  return success(c, "Back to your own session.", await buildAuthResponse(db, admin, c.env.JWT_SECRET, inside));
});

// The frontend's language toggle is otherwise purely client-side (localStorage) — this is what
// lets server-generated content (notifications, etc.) know which language to write in.
auth.put(
  "/language",
  requireAuth,
  zValidator("json", z.object({ preferredLanguage: z.enum(["en", "he"]) })),
  async (c) => {
    const db = getDb(c.env.DB);
    const user = c.get("authUser");
    const { preferredLanguage } = c.req.valid("json");
    await updateUserRow(db, user, { preferredLanguage });
    return success(c, "Language preference updated.", { preferredLanguage });
  }
);
