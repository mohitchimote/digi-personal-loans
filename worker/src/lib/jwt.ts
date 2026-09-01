import { SignJWT, jwtVerify } from "jose";

// Matches auth-service's application.yml: app.jwt.expiration: 86400000 (ms) = 24h.
const JWT_EXPIRATION_SECONDS = 24 * 60 * 60;

export async function signJwt(subjectUuid: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subjectUuid)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + JWT_EXPIRATION_SECONDS)
    .sign(key);
}

export async function verifyJwt(token: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key);
  if (!payload.sub) throw new Error("Token has no subject.");
  return payload.sub;
}

export const JWT_EXPIRES_IN_MS = JWT_EXPIRATION_SECONDS * 1000;
