package com.digibank.application.dto;

import java.math.BigDecimal;

/**
 * Demo-fabricated "Business Financials Intelligence" panel: Financial Ratios, P&L summary,
 * Cashflow Analysis, Risk Grade and DSCR for an underwriter reviewing a business case. No OCR or
 * document-extraction integration exists — figures are synthetic, seeded by applicationRef so
 * they're stable across reloads (same pattern as DataVerificationSummary).
 */
public class BusinessFinancialsAnalysis {

    private String generatedAt;
    private String seed;
    private String riskGrade;
    private BigDecimal dscr;
    private ProfitAndLoss profitAndLoss;
    private CashFlow cashFlow;
    private FinancialRatios ratios;

    public String getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(String generatedAt) { this.generatedAt = generatedAt; }

    public String getSeed() { return seed; }
    public void setSeed(String seed) { this.seed = seed; }

    public String getRiskGrade() { return riskGrade; }
    public void setRiskGrade(String riskGrade) { this.riskGrade = riskGrade; }

    public BigDecimal getDscr() { return dscr; }
    public void setDscr(BigDecimal dscr) { this.dscr = dscr; }

    public ProfitAndLoss getProfitAndLoss() { return profitAndLoss; }
    public void setProfitAndLoss(ProfitAndLoss profitAndLoss) { this.profitAndLoss = profitAndLoss; }

    public CashFlow getCashFlow() { return cashFlow; }
    public void setCashFlow(CashFlow cashFlow) { this.cashFlow = cashFlow; }

    public FinancialRatios getRatios() { return ratios; }
    public void setRatios(FinancialRatios ratios) { this.ratios = ratios; }

    public static class ProfitAndLoss {
        private BigDecimal annualRevenue;
        private BigDecimal costOfGoodsSold;
        private BigDecimal grossProfit;
        private BigDecimal operatingExpenses;
        private BigDecimal ebitda;
        private BigDecimal netProfit;

        public BigDecimal getAnnualRevenue() { return annualRevenue; }
        public void setAnnualRevenue(BigDecimal v) { this.annualRevenue = v; }
        public BigDecimal getCostOfGoodsSold() { return costOfGoodsSold; }
        public void setCostOfGoodsSold(BigDecimal v) { this.costOfGoodsSold = v; }
        public BigDecimal getGrossProfit() { return grossProfit; }
        public void setGrossProfit(BigDecimal v) { this.grossProfit = v; }
        public BigDecimal getOperatingExpenses() { return operatingExpenses; }
        public void setOperatingExpenses(BigDecimal v) { this.operatingExpenses = v; }
        public BigDecimal getEbitda() { return ebitda; }
        public void setEbitda(BigDecimal v) { this.ebitda = v; }
        public BigDecimal getNetProfit() { return netProfit; }
        public void setNetProfit(BigDecimal v) { this.netProfit = v; }
    }

    public static class CashFlow {
        private BigDecimal operatingCashFlow;
        private BigDecimal investingCashFlow;
        private BigDecimal financingCashFlow;
        private BigDecimal netCashFlow;
        private BigDecimal closingCashBalance;

        public BigDecimal getOperatingCashFlow() { return operatingCashFlow; }
        public void setOperatingCashFlow(BigDecimal v) { this.operatingCashFlow = v; }
        public BigDecimal getInvestingCashFlow() { return investingCashFlow; }
        public void setInvestingCashFlow(BigDecimal v) { this.investingCashFlow = v; }
        public BigDecimal getFinancingCashFlow() { return financingCashFlow; }
        public void setFinancingCashFlow(BigDecimal v) { this.financingCashFlow = v; }
        public BigDecimal getNetCashFlow() { return netCashFlow; }
        public void setNetCashFlow(BigDecimal v) { this.netCashFlow = v; }
        public BigDecimal getClosingCashBalance() { return closingCashBalance; }
        public void setClosingCashBalance(BigDecimal v) { this.closingCashBalance = v; }
    }

    public static class FinancialRatios {
        private BigDecimal currentRatio;
        private BigDecimal quickRatio;
        private BigDecimal debtToEquityRatio;
        private BigDecimal netProfitMarginPct;

        public BigDecimal getCurrentRatio() { return currentRatio; }
        public void setCurrentRatio(BigDecimal v) { this.currentRatio = v; }
        public BigDecimal getQuickRatio() { return quickRatio; }
        public void setQuickRatio(BigDecimal v) { this.quickRatio = v; }
        public BigDecimal getDebtToEquityRatio() { return debtToEquityRatio; }
        public void setDebtToEquityRatio(BigDecimal v) { this.debtToEquityRatio = v; }
        public BigDecimal getNetProfitMarginPct() { return netProfitMarginPct; }
        public void setNetProfitMarginPct(BigDecimal v) { this.netProfitMarginPct = v; }
    }
}
