// Deterministic-per-seed PRNG for the "fake it" generators (Data Verification, Business
// Financials Intelligence). The Java originals use `new Random(seed)` (a specific 48-bit LCG) —
// the only real contract is "same appRef always produces the same output," not bit-identical
// output across languages, so a different (but equally deterministic) PRNG is a faithful port.
// javaStringHashCode is included anyway so seed derivation follows the same shape as the Java
// source (`applicationRef.hashCode()`, `ruleKey.hashCode()`), which is convenient and matches the
// spirit of the port even though it isn't strictly required for correctness.

export function javaStringHashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (Math.imul(31, hash) + s.charCodeAt(i)) | 0;
  }
  return hash;
}

// mulberry32 — small, fast, good-enough distribution for demo synthesis.
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  private next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Matches java.util.Random#nextInt(bound): a uniform int in [0, bound). */
  nextInt(bound: number): number {
    return Math.floor(this.next() * bound);
  }

  /** Matches java.util.Random#nextDouble(): a uniform double in [0, 1). */
  nextDouble(): number {
    return this.next();
  }

  nextBoolean(): boolean {
    return this.next() >= 0.5;
  }
}
