import type { AuthUser } from "../types";
import { signJwt, JWT_EXPIRES_IN_MS } from "./jwt";
import { resolveRole } from "./roles";
import type { Db } from "../db/client";
import { getLenderById } from "./lenders";

export async function buildAuthResponse(db: Db, user: AuthUser, jwtSecret: string) {
  // A lender user's token is for their own lender; a platform account starts at lender 0 (none).
  const lenderId = user.lenderId ?? 0;
  const token = await signJwt(user.uuid, jwtSecret, lenderId);
  // Phase 2 - the client gates its UI on these (the server still enforces every one itself).
  const roleConfig = await resolveRole(db, lenderId, user.role);
  const lender = user.lenderId != null ? await getLenderById(db, user.lenderId) : null;
  return {
    token,
    lenderId: user.lenderId,
    lenderCode: lender?.code ?? null,
    lenderName: lender?.name ?? null,
    tokenType: "Bearer",
    userId: user.id,
    email: user.email,
    nationalId: user.nationalId,
    idIssueDate: user.idIssueDate,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    role: user.role,
    roleLabel: roleConfig.isStaff ? roleConfig.label : null,
    entitlements: [...roleConfig.entitlements],
    scope: roleConfig.scope,
    expiresIn: JWT_EXPIRES_IN_MS,
    companyName: user.companyName,
    companyRegistrationNumber: user.companyRegistrationNumber,
    companyIndustry: user.companyIndustry,
    companyFoundedYear: user.companyFoundedYear,
  };
}

export function toCustomerProfile(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    nationalId: user.nationalId,
    idIssueDate: user.idIssueDate,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    companyName: user.companyName,
    companyRegistrationNumber: user.companyRegistrationNumber,
    companyIndustry: user.companyIndustry,
    companyFoundedYear: user.companyFoundedYear,
  };
}

export function toUserSummary(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    nationalId: user.nationalId,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    role: user.role,
    orgUnitId: user.orgUnitId,
    enabled: user.enabled,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
    companyName: user.companyName,
  };
}
