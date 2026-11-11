package com.digibank.affordability.assessment;

import com.digibank.affordability.assessment.dto.AffordabilityRequest;
import com.digibank.affordability.assessment.dto.AffordabilityResult;
import com.digibank.affordability.rules.AffordabilityRulesView;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Assessment context (ARCHITECTURE.md §10) — depends on AffordabilityRulesView, the rules
 * package's read-only interface, not the mutable AffordabilityRules bean directly. This service
 * evaluates a request against whatever the current rules are; it has no way to change them.
 */
@Service
public class AffordabilityService {

    private static final MathContext MC = new MathContext(10, RoundingMode.HALF_UP);

    private final AffordabilityRulesView rules;

    public AffordabilityService(AffordabilityRulesView rules) {
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
        boolean terminal = false;
        boolean structural = false;

        // Hard stops
        if (req.isHasBankruptcy()) {
            failures.add("Active or undischarged bankruptcy on record — application cannot proceed.");
            terminal = true;
        }
        if (req.isHasDefaulted()) {
            failures.add("Previous loan default recorded — application cannot proceed.");
            terminal = true;
        }

        BigDecimal grossIncome = req.getMonthlyGrossIncome();
        BigDecimal netIncome   = req.getMonthlyNetIncome();

        if (netIncome.compareTo(MIN_MONTHLY_INCOME) < 0) {
            failures.add("Monthly net income of ₪" + netIncome.setScale(0, RoundingMode.HALF_UP)
                    + " is below the minimum required ₪" + MIN_MONTHLY_INCOME.setScale(0, RoundingMode.HALF_UP) + ".");
            structural = true;
        }

        // Debt-to-Income
        BigDecimal totalDebt = sum(req.getMonthlyLoans(), req.getCreditCardPayments(), req.getOtherMonthlyCommitments());
        BigDecimal dti = grossIncome.compareTo(BigDecimal.ZERO) > 0
                ? totalDebt.divide(grossIncome, MC).multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP)
                : new BigDecimal("100");

        if (dti.compareTo(MAX_DTI) > 0) {
            failures.add("Payment-to-income ratio of " + AffordabilitySuggestions.num(dti) + "% exceeds the maximum permitted " + AffordabilitySuggestions.num(MAX_DTI) + "%.");
            structural = true;
        }

        // Housing-to-Income
        BigDecimal housingCosts = sum(req.getMonthlyRent(), req.getMonthlyMortgage());
        BigDecimal hti = grossIncome.compareTo(BigDecimal.ZERO) > 0
                ? housingCosts.divide(grossIncome, MC).multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP)
                : new BigDecimal("100");

        if (hti.compareTo(MAX_HTI) > 0) {
            failures.add("Housing cost ratio of " + AffordabilitySuggestions.num(hti) + "% exceeds the maximum permitted " + AffordabilitySuggestions.num(MAX_HTI) + "%.");
            structural = true;
        }

        // Credit score
        int creditScore = req.getCreditScore() != null ? req.getCreditScore() : 0;
        if (creditScore < MIN_CREDIT_SCORE) {
            failures.add("Credit score of " + creditScore + " is below the minimum required score of " + MIN_CREDIT_SCORE + ".");
            structural = true;
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

        boolean capacity = false;
        if (calculatedRepayment.compareTo(repaymentCapacity) > 0 && failures.isEmpty()) {
            failures.add("Calculated monthly repayment of ₪" + AffordabilitySuggestions.num(calculatedRepayment)
                    + " exceeds your available repayment capacity of ₪" + AffordabilitySuggestions.num(repaymentCapacity) + ".");
            capacity = true;
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
                .failureType(AffordabilitySuggestions.failureType(terminal, structural, capacity))
                .maxAffordableAmount(capacity ? AffordabilitySuggestions.maxAffordableAmount(
                        repaymentCapacity.doubleValue(), BASE_ANNUAL_RATE.doubleValue(), n) : null)
                .minAffordableTermMonths(capacity ? AffordabilitySuggestions.minAffordableTermMonths(
                        repaymentCapacity.doubleValue(), BASE_ANNUAL_RATE.doubleValue(), p.doubleValue(),
                        AffordabilitySuggestions.MAX_TERM_MONTHS) : null)
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
