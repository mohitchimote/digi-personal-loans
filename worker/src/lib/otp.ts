import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import type { Db } from "../db/client";
import type { AuthUser } from "../types";
import { AppError } from "./errors";

// Mirrors OtpService.java. Demo-only: no SMS/email provider is integrated,
// so the caller echoes the code back in the API response for on-screen display.
export const OTP_VALIDITY_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;

function generateOtpCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

export async function generateAndAssignOtp(db: Db, user: AuthUser): Promise<string> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_VALIDITY_SECONDS * 1000).toISOString();
  await db
    .update(users)
    .set({ otpCode: code, otpExpiresAt: expiresAt, otpAttempts: 0 })
    .where(eq(users.id, user.id));
  return code;
}

/** Validates the OTP against the given user and clears it on success. Caller decides what
 * happens next (e.g. marking the account verified for registration, or just logging in). */
export async function verifyOtpForUser(db: Db, user: AuthUser, otp: string): Promise<AuthUser> {
  if (!user.otpCode || !user.otpExpiresAt) {
    throw new AppError("No active OTP. Please request a new code.");
  }
  if (new Date() > new Date(user.otpExpiresAt)) {
    throw new AppError("This OTP has expired. Please request a new code.");
  }
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError("Too many incorrect attempts. Please request a new code.");
  }
  if (user.otpCode !== otp) {
    await db
      .update(users)
      .set({ otpAttempts: user.otpAttempts + 1 })
      .where(eq(users.id, user.id));
    throw new AppError("Incorrect OTP code.");
  }

  const [updated] = await db
    .update(users)
    .set({ otpCode: null, otpExpiresAt: null, otpAttempts: 0 })
    .where(eq(users.id, user.id))
    .returning();
  return updated;
}
