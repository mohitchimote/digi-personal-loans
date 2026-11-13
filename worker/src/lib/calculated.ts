import { calculateMonthlyRepayment } from "./repayment";

// Values derived from an application (repayment, total payable ...) are worked out here, once, by the
// backend whenever the data they need is present, and stored in the application's `calculated_json`.
// Letters and screens only read them. A value whose inputs are not there yet is left out, never guessed.

export interface CalculatedInputs {
  applicationType: string;
  loanRequirementsJson: string | null;
  companyDetailsJson: string | null;
  selectedProductJson: string | null;
  approvedAmount: number | null;
}

const parse = (s: string | null): Record<string, unknown> => { try { return s ? (JSON.parse(s) as Record<string, unknown>) : {}; } catch { return {}; } };
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeCalculated(app: CalculatedInputs): Record<string, number> {
  const out: Record<string, number> = {};
  const req = parse(app.applicationType === "BUSINESS" ? app.companyDetailsJson : app.loanRequirementsJson);
  const product = parse(app.selectedProductJson);

  const amount = app.approvedAmount ?? num(req.loanAmount);
  const term = num(product.termMonths) ?? num(req.loanTerm);
  const rate = num(product.interestRate) ?? num(product.apr) ?? num(product.annualInterestRate);
  if (amount === undefined || term === undefined || amount <= 0 || term <= 0) return out;

  out.loanAmount = amount;
  out.termMonths = term;
  if (rate === undefined) return out;
  out.annualRate = rate;
  // A zero rate has no amortisation factor to divide by: it is simply amount / term.
  const monthly = rate === 0 ? round2(amount / term) : calculateMonthlyRepayment(rate, amount, term);
  out.monthlyRepayment = monthly;
  out.totalPayable = round2(monthly * term);
  out.totalInterest = round2(out.totalPayable - amount);
  out.costPerShekel = round2(out.totalPayable / amount);
  return out;
}

/** The extra column to write with a change: pass the application as it will be after the change. */
export function calculatedColumn(afterChange: CalculatedInputs): { calculatedJson: string } {
  return { calculatedJson: JSON.stringify(computeCalculated(afterChange)) };
}
