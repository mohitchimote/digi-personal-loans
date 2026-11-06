import type { AuthUser } from "../types";
import { signJwt, JWT_EXPIRES_IN_MS } from "./jwt";
import { resolveRole } from "./roles";
import type { Db } from "../db/client";

export async function buildAuthResponse(db: Db, user: AuthUser, jwtSecret: string) {
  const token = await signJwt(user.uuid, jwtSecret);
  // Phase 2 - the client gates its UI on these (the server still enforces every one itself).
  const roleConfig = await resolveRole(db, user.role);
  return {
    token,
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
