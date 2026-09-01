// Standard amortization formula, matching ProductService.calculateRepayment (Java):
// M = P * r * (1+r)^n / ((1+r)^n - 1), r = annualRatePercent / 1200
export function calculateMonthlyRepayment(annualRatePercent: number, principal: number, termMonths: number): number {
  const r = annualRatePercent / 1200;
  const factor = Math.pow(1 + r, termMonths);
  return Math.round(((principal * r * factor) / (factor - 1)) * 100) / 100;
}
