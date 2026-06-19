package com.digibank.affordability.service;

import com.digibank.affordability.config.AffordabilityRules;
import com.digibank.affordability.dto.AffordabilityRequest;
import com.digibank.affordability.dto.AffordabilityResult;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Affordability rules are admin-editable at runtime via AffordabilityRules —
 * to be replaced by an external rules engine post-selection.
 */
@Service
public class AffordabilityService {

    private static final MathContext MC = new MathContext(10, RoundingMode.HALF_UP);

    private final AffordabilityRules rules;

    public AffordabilityService(AffordabilityRules rules) {
        this.rules = rules;
    }

    public AffordabilityResult assess(AffordabilityRequest req) {
        BigDecimal MAX_DTI = rules.getMaxDti();
        BigDecimal MAX_HTI = rules.getMaxHti();
        BigDecimal MIN_MONTHLY_INCOME = rules.getMinMonthlyIncome();
        BigDecimal BASE_ANNUAL_RATE = rules.getBaseAnnualRate();
        BigDecimal REPAYMENT_CAPACITY_FACTOR = rules.getRepaymentCapacityFactor();
        int MIN_CREDIT_SCORE = rules.getMinCreditScore();

        List<String> failures = new ArrayList<>();

        // Hard stops
        if (req.isHasBankruptcy()) {
            failures.add("Active or undischarged bankruptcy on record — application cannot proceed.");
        }
        if (req.isHasDefaulted()) {
            failures.add("Previous loan default recorded — application cannot proceed.");
        }

        BigDecimal grossIncome = req.getMonthlyGrossIncome();
        BigDecimal netIncome   = req.getMonthlyNetIncome();

        if (netIncome.compareTo(MIN_MONTHLY_INCOME) < 0) {
            failures.add("Monthly net income of ₪" + netIncome.setScale(0, RoundingMode.HALF_UP)
                    + " is below the minimum required ₪" + MIN_MONTHLY_INCOME.setScale(0, RoundingMode.HALF_UP) + ".");
        }

        // Debt-to-Income
        BigDecimal totalDebt = sum(req.getMonthlyLoans(), req.getCreditCardPayments(), req.getOtherMonthlyCommitments());
        BigDecimal dti = grossIncome.compareTo(BigDecimal.ZERO) > 0
                ? totalDebt.divide(grossIncome, MC).multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP)
                : new BigDecimal("100");

        if (dti.compareTo(MAX_DTI) > 0) {
            failures.add("Debt-to-income ratio of " + dti + "% exceeds the maximum permitted " + MAX_DTI + "%.");
        }

        // Housing-to-Income
        BigDecimal housingCosts = sum(req.getMonthlyRent(), req.getMonthlyMortgage());
        BigDecimal hti = grossIncome.compareTo(BigDecimal.ZERO) > 0
                ? housingCosts.divide(grossIncome, MC).multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP)
                : new BigDecimal("100");

        if (hti.compareTo(MAX_HTI) > 0) {
            failures.add("Housing cost ratio of " + hti + "% exceeds the maximum permitted " + MAX_HTI + "%.");
        }

        // Credit score
        int creditScore = req.getCreditScore() != null ? req.getCreditScore() : 0;
        if (creditScore < MIN_CREDIT_SCORE) {
            failures.add("Credit score of " + creditScore + " is below the minimum required score of " + MIN_CREDIT_SCORE + ".");
        }

        // Monthly repayment capacity
        BigDecimal totalCommitments = sum(totalDebt, housingCosts, req.getMonthlyLivingExpenses());
        BigDecimal disposable = netIncome.subtract(totalCommitments);
        BigDecimal repaymentCapacity = disposable.multiply(REPAYMENT_CAPACITY_FACTOR).setScale(2, RoundingMode.HALF_UP);

        // Calculate actual monthly repayment using standard amortisation
        BigDecimal monthlyRate = BASE_ANNUAL_RATE.divide(new BigDecimal("12"), MC);
        int n = req.getRequestedTermMonths();
        BigDecimal p = req.getRequestedLoanAmount();
        BigDecimal onePlusR = BigDecimal.ONE.add(monthlyRate);
        BigDecimal onePlusRpowN = onePlusR.pow(n, MC);
        BigDecimal calculatedRepayment = p.multiply(monthlyRate).multiply(onePlusRpowN)
                .divide(onePlusRpowN.subtract(BigDecimal.ONE), MC)
                .setScale(2, RoundingMode.HALF_UP);

        if (calculatedRepayment.compareTo(repaymentCapacity) > 0 && failures.isEmpty()) {
            failures.add("Calculated monthly repayment of ₪" + calculatedRepayment
                    + " exceeds your available repayment capacity of ₪" + repaymentCapacity + ".");
        }

        String riskCategory = deriveRisk(creditScore, dti);
        String creditCategory = deriveCreditCategory(creditScore);

        return AffordabilityResult.builder()
                .passed(failures.isEmpty())
                .dti(dti)
                .hti(hti)
                .disposableIncome(disposable.setScale(2, RoundingMode.HALF_UP))
                .monthlyRepaymentCapacity(repaymentCapacity)
                .calculatedMonthlyRepayment(calculatedRepayment)
                .failureReasons(failures)
                .riskCategory(riskCategory)
                .creditScoreCategory(creditCategory)
                .build();
    }

    private BigDecimal sum(BigDecimal... values) {
        BigDecimal total = BigDecimal.ZERO;
        for (BigDecimal v : values) {
            if (v != null) total = total.add(v);
        }
        return total;
    }

    private String deriveRisk(int score, BigDecimal dti) {
        if (score >= 8 && dti.compareTo(new BigDecimal("25")) <= 0) return "LOW";
        if (score >= 6) return "MEDIUM";
        return "HIGH";
    }

    private String deriveCreditCategory(int score) {
        if (score >= 8) return "EXCELLENT";
        if (score >= 7) return "GOOD";
        if (score >= 6) return "FAIR";
        return "POOR";
    }
}
