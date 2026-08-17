import type { AuthUser } from "../types";
import { signJwt, JWT_EXPIRES_IN_MS } from "./jwt";

export async function buildAuthResponse(user: AuthUser, jwtSecret: string) {
  const token = await signJwt(user.uuid, jwtSecret);
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
    expiresIn: JWT_EXPIRES_IN_MS,
    companyName: user.companyName,
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
    enabled: user.enabled,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
    companyName: user.companyName,
  };
}
