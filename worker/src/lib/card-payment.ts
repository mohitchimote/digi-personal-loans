// N1 (ARCHITECTURE_REVIEW_GAPS.md) — simulated card-payment adapter, same "fake it" demo-synthesis
// pattern as business-financials.ts/data-verification.ts (ARCHITECTURE.md §6.3): deterministic
// seed from applicationRef so the same application always produces the same synthetic result,
// stable across reloads. No real card processor/PCI scope — a payment-provider decision (which
// processor, PCI implications) was explicitly out of scope for this pass; this exists so the
// adapter seam is in place, mirroring backend/integration-service's identically-shaped
// CardPaymentGenerator (in the Java target, this in-process function stands in for that separate
// service, same as every other simulated adapter in this file's siblings).

import { javaStringHashCode, SeededRandom } from "./seeded-random";

export interface CardPaymentResult {
  transactionId: string;
  status: string;
  amount: number | null;
  cardLast4: string;
  authorisationCode: string;
  generatedAt: string;
  seed: string;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

export function authoriseCardPayment(applicationRef: string, amount: number | null): CardPaymentResult {
  const seed = javaStringHashCode(applicationRef);
  const rng = new SeededRandom(seed);

  return {
    transactionId: `TXN-${applicationRef.replace(/[^A-Za-z0-9]/g, "")}-${pad(rng.nextInt(1_000_000), 6)}`,
    status: "AUTHORISED",
    amount,
    cardLast4: pad(rng.nextInt(10_000), 4),
    authorisationCode: pad(rng.nextInt(1_000_000), 6),
    generatedAt: new Date().toISOString(),
    seed: applicationRef,
  };
}
