import { SignJWT, jwtVerify } from "jose";

// Matches auth-service's application.yml: app.jwt.expiration: 86400000 (ms) = 24h.
const JWT_EXPIRATION_SECONDS = 24 * 60 * 60;

// `lnd` is the lender the token is for: the user's own lender, or 0 for a platform (super admin)
// token that is not inside any lender. requireAuth checks it against the user's row, so a token
// can never be replayed against a different lender than the one it was issued for.
export async function signJwt(subjectUuid: string, secret: string, lenderId: number): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ lnd: lenderId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subjectUuid)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + JWT_EXPIRATION_SECONDS)
    .sign(key);
}

export interface VerifiedJwt {
  uuid: string;
  issuedAt: number; // seconds since epoch — used for S2 session-revocation comparison
  lenderId: number; // 0 = platform token (not inside any lender)
}

export async function verifyJwt(token: string, secret: string): Promise<VerifiedJwt> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key);
  if (!payload.sub) throw new Error("Token has no subject.");
  if (!payload.iat) throw new Error("Token has no issued-at claim.");
  if (typeof payload.lnd !== "number") throw new Error("Token has no lender claim.");
  return { uuid: payload.sub, issuedAt: payload.iat, lenderId: payload.lnd };
}

export const JWT_EXPIRES_IN_MS = JWT_EXPIRATION_SECONDS * 1000;
