package com.digibank.affordability.service;

import com.digibank.affordability.dto.AffordabilityRequest;
import com.digibank.affordability.dto.AffordabilityResult;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Hardcoded affordability rules — to be replaced by external rules engine post-selection.
 * Rules are based on Bank of Israel personal lending guidelines for demo purposes.
 */
@Service
public class AffordabilityService {

    private static final BigDecimal MAX_DTI = new BigDecimal("40");
    private static final BigDecimal MAX_HTI = new BigDecimal("35");
    private static final BigDecimal MIN_MONTHLY_INCOME = new BigDecimal("8000");
    private static final BigDecimal BASE_ANNUAL_RATE = new BigDecimal("0.06");
    private static final BigDecimal REPAYMENT_CAPACITY_FACTOR = new BigDecimal("0.40");
    private static final int MIN_CREDIT_SCORE = 580;
    private static final MathContext MC = new MathContext(10, RoundingMode.HALF_UP);

    public AffordabilityResult assess(AffordabilityRequest req) {
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
                    + " is below the minimum required ₪8,000.");
        }

        // Debt-to-Income
        BigDecimal totalDebt = sum(req.getMonthlyLoans(), req.getCreditCardPayments(), req.getOtherMonthlyCommitments());
        BigDecimal dti = grossIncome.compareTo(BigDecimal.ZERO) > 0
                ? totalDebt.divide(grossIncome, MC).multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP)
                : new BigDecimal("100");

        if (dti.compareTo(MAX_DTI) > 0) {
            failures.add("Debt-to-income ratio of " + dti + "% exceeds the maximum permitted 40%.");
        }

        // Housing-to-Income
        BigDecimal housingCosts = sum(req.getMonthlyRent(), req.getMonthlyMortgage());
        BigDecimal hti = grossIncome.compareTo(BigDecimal.ZERO) > 0
                ? housingCosts.divide(grossIncome, MC).multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP)
                : new BigDecimal("100");

        if (hti.compareTo(MAX_HTI) > 0) {
            failures.add("Housing cost ratio of " + hti + "% exceeds the maximum permitted 35%.");
        }

        // Credit score
        int creditScore = req.getCreditScore() != null ? req.getCreditScore() : 0;
        if (creditScore < MIN_CREDIT_SCORE) {
            failures.add("Credit score of " + creditScore + " is below the minimum required score of 580.");
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
        if (score >= 750 && dti.compareTo(new BigDecimal("25")) <= 0) return "LOW";
        if (score >= 650) return "MEDIUM";
        return "HIGH";
    }

    private String deriveCreditCategory(int score) {
        if (score >= 750) return "EXCELLENT";
        if (score >= 700) return "GOOD";
        if (score >= 650) return "FAIR";
        return "POOR";
    }
}
