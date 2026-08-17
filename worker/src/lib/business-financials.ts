import { javaStringHashCode, SeededRandom } from "./seeded-random";

// Ports BusinessFinancialsAnalysisService.java. Demo-fabricated P&L/Cashflow/Ratios/Risk Grade
// for the underwriter case-detail Affordability tab — no OCR/document-extraction integration
// exists, so these figures are synthetic, seeded by applicationRef, generated once and cached.

function money(v: number): number {
  return Math.round(v * 100) / 100;
}

function safeParse(json: string | null): any {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function computeRiskGrade(dscr: number | null, directorScore: number, currentRatio: number, debtToEquity: number): string {
  const dscrValue = dscr != null ? dscr : 1.25;
  let score = 0;
  score += Math.min(dscrValue / 2.0, 1.0) * 35;
  score += (directorScore / 100.0) * 30;
  score += Math.min(currentRatio / 2.0, 1.0) * 20;
  score += Math.max(0, 1 - debtToEquity / 1.5) * 15;

  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "E";
}

export function generateBusinessFinancialsAnalysis(app: {
  applicationRef: string;
  businessFinancialsJson: string | null;
  businessCreditDeclarationsJson: string | null;
  affordabilityResultJson: string | null;
}) {
  const financials = safeParse(app.businessFinancialsJson);
  const credit = safeParse(app.businessCreditDeclarationsJson);
  const afford = safeParse(app.affordabilityResultJson);

  const seed = javaStringHashCode(app.applicationRef);
  const rng = new SeededRandom(seed);

  let monthlyRevenue = Number(financials.monthlyRevenue ?? 0);
  if (monthlyRevenue <= 0) monthlyRevenue = Number(financials.annualTurnover ?? 600_000) / 12.0;
  const annualRevenue = monthlyRevenue * 12;

  const cogsPct = 0.4 + rng.nextDouble() * 0.15; // 40-55%
  const opexPct = 0.2 + rng.nextDouble() * 0.1; // 20-30%
  const cogs = annualRevenue * cogsPct;
  const grossProfit = annualRevenue - cogs;
  const opex = annualRevenue * opexPct;
  const ebitda = grossProfit - opex;
  const netProfit = ebitda * 0.78;

  const profitAndLoss = {
    annualRevenue: money(annualRevenue),
    costOfGoodsSold: money(cogs),
    grossProfit: money(grossProfit),
    operatingExpenses: money(opex),
    ebitda: money(ebitda),
    netProfit: money(netProfit),
  };

  const operatingCashFlow = netProfit + annualRevenue * 0.03;
  const investingCashFlow = -annualRevenue * (0.02 + rng.nextDouble() * 0.04);
  const financingCashFlow = -annualRevenue * (0.01 + rng.nextDouble() * 0.02);
  const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;
  const closingCashBalance = monthlyRevenue * 1.5 + netCashFlow * 0.5;

  const cashFlow = {
    operatingCashFlow: money(operatingCashFlow),
    investingCashFlow: money(investingCashFlow),
    financingCashFlow: money(financingCashFlow),
    netCashFlow: money(netCashFlow),
    closingCashBalance: money(closingCashBalance),
  };

  const currentRatio = 1.2 + rng.nextDouble() * 0.8; // 1.2-2.0
  const quickRatio = currentRatio * (0.65 + rng.nextDouble() * 0.15);
  const debtToEquity = 0.5 + rng.nextDouble() * 1.0; // 0.5-1.5
  const netProfitMarginPct = annualRevenue > 0 ? (netProfit / annualRevenue) * 100 : 0;

  const ratios = {
    currentRatio: money(currentRatio),
    quickRatio: money(quickRatio),
    debtToEquityRatio: money(debtToEquity),
    netProfitMarginPct: money(netProfitMarginPct),
  };

  const dscr = typeof afford.dscr === "number" ? afford.dscr : afford.dscr ? Number(afford.dscr) : null;
  // Director credit score is a Dun & Bradstreet-style Commercial Delinquency Score (1-100,
  // higher = lower risk), not the old internal 1-9 scale.
  const directorScore = Number(credit.directorCreditScore ?? 65);
  const riskGrade = computeRiskGrade(dscr, directorScore, currentRatio, debtToEquity);

  return {
    generatedAt: new Date().toISOString(),
    seed: app.applicationRef,
    dscr,
    riskGrade,
    profitAndLoss,
    cashFlow,
    ratios,
  };
}
