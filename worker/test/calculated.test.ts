import { describe, expect, it } from "vitest";
import { computeCalculated } from "../src/lib/calculated";

const base = { applicationType: "PERSONAL", loanRequirementsJson: null, companyDetailsJson: null, selectedProductJson: null, approvedAmount: null };

describe("computeCalculated", () => {
  it("leaves out what it cannot work out yet", () => {
    expect(computeCalculated(base)).toEqual({});
    const withLoan = { ...base, loanRequirementsJson: JSON.stringify({ loanAmount: 100000, loanTerm: 60 }) };
    expect(computeCalculated(withLoan)).toEqual({ loanAmount: 100000, termMonths: 60 });
  });
  it("works out repayment and totals once a rate is known", () => {
    const out = computeCalculated({ ...base, loanRequirementsJson: JSON.stringify({ loanAmount: 100000, loanTerm: 60 }), selectedProductJson: JSON.stringify({ interestRate: 6 }) });
    expect(out.monthlyRepayment).toBe(1933.28);
    expect(out.totalPayable).toBe(115996.8);
    expect(out.totalInterest).toBe(15996.8);
    expect(out.costPerShekel).toBe(1.16);
  });
  it("uses the approved amount and the product's own term over the request", () => {
    const out = computeCalculated({ ...base, approvedAmount: 50000, loanRequirementsJson: JSON.stringify({ loanAmount: 100000, loanTerm: 60 }), selectedProductJson: JSON.stringify({ apr: 4.8, termMonths: 48 }) });
    expect(out.loanAmount).toBe(50000);
    expect(out.termMonths).toBe(48);
    expect(out.annualRate).toBe(4.8);
  });
  it("reads a business application's loan from its company details", () => {
    const out = computeCalculated({ ...base, applicationType: "BUSINESS", companyDetailsJson: JSON.stringify({ loanAmount: 200000, loanTerm: 36 }), selectedProductJson: JSON.stringify({ interestRate: 0 }) });
    expect(out.monthlyRepayment).toBe(5555.56);
    expect(out.totalInterest).toBeCloseTo(0, 0);
  });
});
