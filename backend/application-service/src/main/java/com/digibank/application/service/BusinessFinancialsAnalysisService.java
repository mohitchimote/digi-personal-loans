package com.digibank.application.service;

import com.digibank.application.dto.BusinessFinancialsAnalysis;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Random;

/**
 * Demo-fabricated "Business Financials Intelligence" panel for the underwriter case-detail view:
 * Financial Ratios, P&L summary, Cashflow Analysis, Risk Grade and DSCR derived from whatever
 * business data exists on the application. No OCR/document-extraction integration exists —
 * uploaded financial statements/bank statements are never read; figures are synthetic, seeded by
 * applicationRef so they're stable across reloads (same "fake it" pattern as DataVerificationService).
 */
@Service
public class BusinessFinancialsAnalysisService {

    private final LoanApplicationRepository repository;
    private final ObjectMapper objectMapper;

    public BusinessFinancialsAnalysisService(LoanApplicationRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public BusinessFinancialsAnalysis getOrGenerate(String appRef) {
        LoanApplication app = getByRef(appRef);
        if (app.getBusinessFinancialsAnalysisJson() != null) {
            return deserialize(app.getBusinessFinancialsAnalysisJson());
        }
        BusinessFinancialsAnalysis analysis = generate(app);
        persist(app, analysis);
        return analysis;
    }

    private BusinessFinancialsAnalysis generate(LoanApplication app) {
        JsonNode financials = readTree(app.getBusinessFinancialsJson());
        JsonNode credit = readTree(app.getBusinessCreditDeclarationsJson());
        JsonNode afford = readTree(app.getAffordabilityResultJson());

        long seed = app.getApplicationRef().hashCode();
        Random rng = new Random(seed);

        double monthlyRevenue = financials.path("monthlyRevenue").asDouble(0);
        if (monthlyRevenue <= 0) monthlyRevenue = financials.path("annualTurnover").asDouble(600_000) / 12.0;
        double annualRevenue = monthlyRevenue * 12;

        double cogsPct = 0.40 + rng.nextDouble() * 0.15;     // 40-55%
        double opexPct = 0.20 + rng.nextDouble() * 0.10;     // 20-30%
        double cogs = annualRevenue * cogsPct;
        double grossProfit = annualRevenue - cogs;
        double opex = annualRevenue * opexPct;
        double ebitda = grossProfit - opex;
        double netProfit = ebitda * 0.78; // after tax/interest, approx

        BusinessFinancialsAnalysis.ProfitAndLoss pnl = new BusinessFinancialsAnalysis.ProfitAndLoss();
        pnl.setAnnualRevenue(money(annualRevenue));
        pnl.setCostOfGoodsSold(money(cogs));
        pnl.setGrossProfit(money(grossProfit));
        pnl.setOperatingExpenses(money(opex));
        pnl.setEbitda(money(ebitda));
        pnl.setNetProfit(money(netProfit));

        double operatingCashFlow = netProfit + (annualRevenue * 0.03); // add back depreciation
        double investingCashFlow = -annualRevenue * (0.02 + rng.nextDouble() * 0.04);
        double financingCashFlow = -annualRevenue * (0.01 + rng.nextDouble() * 0.02);
        double netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;
        double closingCashBalance = (monthlyRevenue * 1.5) + netCashFlow * 0.5;

        BusinessFinancialsAnalysis.CashFlow cashFlow = new BusinessFinancialsAnalysis.CashFlow();
        cashFlow.setOperatingCashFlow(money(operatingCashFlow));
        cashFlow.setInvestingCashFlow(money(investingCashFlow));
        cashFlow.setFinancingCashFlow(money(financingCashFlow));
        cashFlow.setNetCashFlow(money(netCashFlow));
        cashFlow.setClosingCashBalance(money(closingCashBalance));

        double currentRatio = 1.2 + rng.nextDouble() * 0.8;   // 1.2-2.0
        double quickRatio = currentRatio * (0.65 + rng.nextDouble() * 0.15);
        double debtToEquity = 0.5 + rng.nextDouble() * 1.0;   // 0.5-1.5
        double netProfitMarginPct = annualRevenue > 0 ? (netProfit / annualRevenue) * 100 : 0;

        BusinessFinancialsAnalysis.FinancialRatios ratios = new BusinessFinancialsAnalysis.FinancialRatios();
        ratios.setCurrentRatio(ratio(currentRatio));
        ratios.setQuickRatio(ratio(quickRatio));
        ratios.setDebtToEquityRatio(ratio(debtToEquity));
        ratios.setNetProfitMarginPct(ratio(netProfitMarginPct));

        BigDecimal dscr = afford.has("dscr") ? new BigDecimal(afford.path("dscr").asText("0")) : null;
        // Director credit score is a Dun & Bradstreet-style Commercial Delinquency Score (1-100,
        // higher = lower risk), not the old internal 1-9 scale.
        int directorScore = credit.path("directorCreditScore").asInt(65);
        String riskGrade = computeRiskGrade(dscr, directorScore, currentRatio, debtToEquity);

        BusinessFinancialsAnalysis analysis = new BusinessFinancialsAnalysis();
        analysis.setGeneratedAt(LocalDateTime.now().toString());
        analysis.setSeed(app.getApplicationRef());
        analysis.setDscr(dscr);
        analysis.setRiskGrade(riskGrade);
        analysis.setProfitAndLoss(pnl);
        analysis.setCashFlow(cashFlow);
        analysis.setRatios(ratios);
        return analysis;
    }

    /** Simple A-E letter grade blending DSCR, director credit score, liquidity and leverage —
     * presentable single signal, not a full credit-model. directorScore is a D&B-style 1-100
     * Commercial Delinquency Score (higher = lower risk). */
    private String computeRiskGrade(BigDecimal dscr, int directorScore, double currentRatio, double debtToEquity) {
        double dscrValue = dscr != null ? dscr.doubleValue() : 1.25;
        double score = 0;
        score += Math.min(dscrValue / 2.0, 1.0) * 35;          // up to 35 pts
        score += (directorScore / 100.0) * 30;                  // up to 30 pts
        score += Math.min(currentRatio / 2.0, 1.0) * 20;        // up to 20 pts
        score += Math.max(0, 1 - (debtToEquity / 1.5)) * 15;    // up to 15 pts

        if (score >= 80) return "A";
        if (score >= 65) return "B";
        if (score >= 50) return "C";
        if (score >= 35) return "D";
        return "E";
    }

    private BigDecimal money(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal ratio(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP);
    }

    private JsonNode readTree(String json) {
        if (json == null) return objectMapper.createObjectNode();
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException e) {
            return objectMapper.createObjectNode();
        }
    }

    private BusinessFinancialsAnalysis deserialize(String json) {
        try {
            return objectMapper.readValue(json, BusinessFinancialsAnalysis.class);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize business financials analysis", e);
        }
    }

    private void persist(LoanApplication app, BusinessFinancialsAnalysis analysis) {
        try {
            app.setBusinessFinancialsAnalysisJson(objectMapper.writeValueAsString(analysis));
            repository.save(app);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize business financials analysis", e);
        }
    }

    private LoanApplication getByRef(String appRef) {
        return repository.findByApplicationRef(appRef)
                .orElseThrow(() -> new IllegalArgumentException("Application not found: " + appRef));
    }
}
