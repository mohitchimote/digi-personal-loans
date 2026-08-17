// Ports AffordabilityService.java / BusinessAffordabilityService.java. Java used BigDecimal with
// 10-digit precision, HALF_UP rounding; plain JS doubles are more than precise enough at these
// loan-amount magnitudes, so this is a direct arithmetic port, not a precision-loss risk.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface AffordabilityRulesValues {
  maxDti: number;
  maxHti: number;
  minMonthlyIncome: number;
  baseAnnualRate: number;
  repaymentCapacityFactor: number;
  minCreditScore: number;
}

export interface AffordabilityRequest {
  monthlyGrossIncome: number;
  monthlyNetIncome: number;
  monthlyRent?: number;
  monthlyMortgage?: number;
  monthlyLoans?: number;
  creditCardPayments?: number;
  otherMonthlyCommitments?: number;
  monthlyLivingExpenses?: number;
  requestedLoanAmount: number;
  requestedTermMonths: number;
  creditScore?: number;
  hasDefaulted?: boolean;
  hasBankruptcy?: boolean;
}

function deriveRisk(score: number, dti: number): string {
  if (score >= 8 && dti <= 25) return "LOW";
  if (score >= 6) return "MEDIUM";
  return "HIGH";
}

function deriveCreditCategory(score: number): string {
  if (score >= 8) return "EXCELLENT";
  if (score >= 7) return "GOOD";
  if (score >= 6) return "FAIR";
  return "POOR";
}

export function assessPersonalAffordability(req: AffordabilityRequest, rules: AffordabilityRulesValues) {
  const failures: string[] = [];

  if (req.hasBankruptcy) failures.push("Active or undischarged bankruptcy on record — application cannot proceed.");
  if (req.hasDefaulted) failures.push("Previous loan default recorded — application cannot proceed.");

  const grossIncome = req.monthlyGrossIncome;
  const netIncome = req.monthlyNetIncome;

  if (netIncome < rules.minMonthlyIncome) {
    failures.push(
      `Monthly net income of ₪${Math.round(netIncome)} is below the minimum required ₪${Math.round(rules.minMonthlyIncome)}.`
    );
  }

  const totalDebt = (req.monthlyLoans ?? 0) + (req.creditCardPayments ?? 0) + (req.otherMonthlyCommitments ?? 0);
  const dti = grossIncome > 0 ? round2((totalDebt / grossIncome) * 100) : 100;
  if (dti > rules.maxDti) {
    failures.push(`Debt-to-income ratio of ${dti}% exceeds the maximum permitted ${rules.maxDti}%.`);
  }

  const housingCosts = (req.monthlyRent ?? 0) + (req.monthlyMortgage ?? 0);
  const hti = grossIncome > 0 ? round2((housingCosts / grossIncome) * 100) : 100;
  if (hti > rules.maxHti) {
    failures.push(`Housing cost ratio of ${hti}% exceeds the maximum permitted ${rules.maxHti}%.`);
  }

  const creditScore = req.creditScore ?? 0;
  if (creditScore < rules.minCreditScore) {
    failures.push(`Credit score of ${creditScore} is below the minimum required score of ${rules.minCreditScore}.`);
  }

  const totalCommitments = totalDebt + housingCosts + (req.monthlyLivingExpenses ?? 0);
  const disposable = netIncome - totalCommitments;
  const repaymentCapacity = round2(disposable * rules.repaymentCapacityFactor);

  const monthlyRate = rules.baseAnnualRate / 12;
  const n = req.requestedTermMonths;
  const p = req.requestedLoanAmount;
  const onePlusRpowN = Math.pow(1 + monthlyRate, n);
  const calculatedRepayment = round2((p * monthlyRate * onePlusRpowN) / (onePlusRpowN - 1));

  if (calculatedRepayment > repaymentCapacity && failures.length === 0) {
    failures.push(
      `Calculated monthly repayment of ₪${calculatedRepayment} exceeds your available repayment capacity of ₪${repaymentCapacity}.`
    );
  }

  return {
    passed: failures.length === 0,
    dti,
    hti,
    disposableIncome: round2(disposable),
    monthlyRepaymentCapacity: repaymentCapacity,
    calculatedMonthlyRepayment: calculatedRepayment,
    failureReasons: failures,
    riskCategory: deriveRisk(creditScore, dti),
    creditScoreCategory: deriveCreditCategory(creditScore),
  };
}

export interface BusinessAffordabilityRequest {
  annualTurnover: number;
  monthlyRevenue: number;
  monthlyOutgoings?: number;
  existingBusinessDebtService?: number;
  requestedLoanAmount: number;
  requestedTermMonths: number;
  directorCreditScore?: number;
  hasCompanyDefaulted?: boolean;
  hasLiquidationOrWindingUp?: boolean;
}

const MIN_DSCR = 1.25;
const BUSINESS_BASE_ANNUAL_RATE = 0.07; // business loans price slightly above personal
const MIN_DIRECTOR_CREDIT_SCORE = 5;

function deriveBusinessRisk(dscr: number, directorScore: number): string {
  if (dscr >= 1.75 && directorScore >= 8) return "LOW";
  if (dscr >= MIN_DSCR) return "MEDIUM";
  return "HIGH";
}

export function assessBusinessAffordability(req: BusinessAffordabilityRequest) {
  const failures: string[] = [];

  if (req.hasLiquidationOrWindingUp) {
    failures.push("Company has an active liquidation or winding-up petition on record — application cannot proceed.");
  }
  if (req.hasCompanyDefaulted) {
    failures.push("Previous business loan default recorded — application cannot proceed.");
  }

  const directorScore = req.directorCreditScore ?? 0;
  if (directorScore < MIN_DIRECTOR_CREDIT_SCORE) {
    failures.push(
      `Primary signatory's credit score of ${directorScore} is below the minimum required score of ${MIN_DIRECTOR_CREDIT_SCORE}.`
    );
  }

  const monthlyRevenue = req.monthlyRevenue;
  const monthlyOutgoings = req.monthlyOutgoings ?? 0;
  const netOperatingIncome = monthlyRevenue - monthlyOutgoings;

  const monthlyRate = BUSINESS_BASE_ANNUAL_RATE / 12;
  const n = req.requestedTermMonths;
  const p = req.requestedLoanAmount;
  const onePlusRpowN = Math.pow(1 + monthlyRate, n);
  const calculatedRepayment = round2((p * monthlyRate * onePlusRpowN) / (onePlusRpowN - 1));

  const existingDebtService = req.existingBusinessDebtService ?? 0;
  const totalDebtService = existingDebtService + calculatedRepayment;

  const dscr = totalDebtService > 0 ? round2(netOperatingIncome / totalDebtService) : 99.0;
  if (dscr < MIN_DSCR) {
    failures.push(`Debt Service Coverage Ratio of ${dscr} is below the minimum required ${MIN_DSCR}.`);
  }

  const repaymentCapacity = round2(netOperatingIncome - existingDebtService);

  return {
    passed: failures.length === 0,
    dscr,
    monthlyNetOperatingIncome: round2(netOperatingIncome),
    monthlyRepaymentCapacity: repaymentCapacity,
    calculatedMonthlyRepayment: calculatedRepayment,
    failureReasons: failures,
    riskCategory: deriveBusinessRisk(dscr, directorScore),
    creditScoreCategory: deriveCreditCategory(directorScore),
  };
}
