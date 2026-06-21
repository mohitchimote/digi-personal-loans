/**
 * Customers see real bureau-style scores: personal credit declarations use a FICO-style 300-850
 * scale, business (director) credit declarations use a Dun & Bradstreet-style Delinquency Score
 * on a 1-100 scale (higher = lower risk). All existing eligibility/affordability backend logic
 * (ProductService.isEligible, AffordabilityService/BusinessAffordabilityService thresholds,
 * AffordabilityRules.minCreditScore) was built against an internal 1-9 lender risk grade and is
 * left untouched — these pure functions convert the bureau-style score into that internal grade
 * at the point the frontend builds a product-eligibility/affordability request, so no backend
 * threshold needs rewriting. The grade (and, for business, the D&B Risk Class) is for underwriter
 * eyes only — never sent to or rendered for the customer.
 */

export function ficoToLenderGrade(fico: number): number {
  const clamped = Math.max(300, Math.min(850, fico || 300));
  return Math.max(1, Math.min(9, Math.round(1 + ((clamped - 300) / 550) * 8)));
}

export function dnbScoreToLenderGrade(dnb: number): number {
  const clamped = Math.max(1, Math.min(100, dnb || 1));
  return Math.max(1, Math.min(9, Math.round(1 + ((clamped - 1) / 99) * 8)));
}

/** D&B's own 1-5 Risk Class bracket (1 = lowest risk, 5 = highest), derived from the Delinquency Score. */
export function dnbScoreToRiskClass(dnb: number): number {
  const clamped = Math.max(1, Math.min(100, dnb || 1));
  if (clamped >= 67) return 1;
  if (clamped >= 51) return 2;
  if (clamped >= 32) return 3;
  if (clamped >= 18) return 4;
  return 5;
}
