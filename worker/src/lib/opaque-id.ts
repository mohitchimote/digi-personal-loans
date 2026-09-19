import { AppError } from "./errors";

// S6 (ARCHITECTURE_REVIEW_GAPS.md) — API-boundary ID obfuscation, deliberately not a schema
// migration: internal numeric auto-increment PKs are unchanged everywhere; only what crosses the
// API boundary (JSON responses, path params) is opaque. This is obfuscation against casual
// enumeration/business-intelligence leakage (e.g. inferring customer/document volume), not
// cryptographic security — anyone with the source can reverse it, same caveat as Hashids et al.
// The real access-control fix is the ownership checks from S1/S6; this is defense-in-depth on top.
//
// Bijection over [0, PRIME) via multiplication by a fixed multiplier mod PRIME (PRIME is prime, so
// every nonzero multiplier has a modular inverse, i.e. the map is reversible with no collisions)
// — the same technique Hashids/Sqids use under the hood, without adding a dependency for it.
// `prefix` namespaces different entity types so a "doc" id can never be replayed as an "upl" id.

const PRIME = 4294967311n; // first prime above 2^32 — comfortably above any realistic row count
const MULTIPLIER = 2654435761n; // Knuth's multiplicative hash constant; coprime to PRIME since PRIME is prime

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

// Fermat's little theorem: for prime `mod`, a^(mod-2) mod mod is a's modular inverse.
const MULTIPLIER_INV = modPow(MULTIPLIER, PRIME - 2n, PRIME);

function toBase36(n: bigint): string {
  return n.toString(36);
}

function fromBase36(s: string): bigint {
  let n = 0n;
  for (const ch of s.toLowerCase()) {
    const digit = parseInt(ch, 36);
    if (Number.isNaN(digit)) throw new AppError("Invalid id.", 400);
    n = n * 36n + BigInt(digit);
  }
  return n;
}

export function encodeOpaqueId(prefix: string, id: number): string {
  const obfuscated = (BigInt(id) * MULTIPLIER) % PRIME;
  return `${prefix}_${toBase36(obfuscated)}`;
}

export function decodeOpaqueId(prefix: string, opaque: string): number {
  const expectedPrefix = `${prefix}_`;
  if (!opaque.startsWith(expectedPrefix)) {
    throw new AppError("Invalid id.", 400);
  }
  const obfuscated = fromBase36(opaque.slice(expectedPrefix.length));
  if (obfuscated < 0n || obfuscated >= PRIME) {
    throw new AppError("Invalid id.", 400);
  }
  const id = (obfuscated * MULTIPLIER_INV) % PRIME;
  return Number(id);
}
