package com.digibank.affordability.service;

import com.digibank.affordability.dto.BusinessAffordabilityRequest;
import com.digibank.affordability.dto.BusinessAffordabilityResult;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Business-loan equivalent of AffordabilityService. Thresholds are constants for this first pass
 * (matches how the personal AffordabilityRules started life before the admin Rules page existed) —
 * a fast-follow would make these admin-editable the same way.
 */
@Service
public class BusinessAffordabilityService {

    private static final MathContext MC = new MathContext(10, RoundingMode.HALF_UP);
    private static final BigDecimal MIN_DSCR = new BigDecimal("1.25");
    private static final BigDecimal BASE_ANNUAL_RATE = new BigDecimal("0.07"); // business loans price slightly above personal
    private static final int MIN_DIRECTOR_CREDIT_SCORE = 5;

    public BusinessAffordabilityResult assess(BusinessAffordabilityRequest req) {
        List<String> failures = new ArrayList<>();

        if (req.isHasLiquidationOrWindingUp()) {
            failures.add("Company has an active liquidation or winding-up petition on record — application cannot proceed.");
        }
        if (req.isHasCompanyDefaulted()) {
            failures.add("Previous business loan default recorded — application cannot proceed.");
        }

        int directorScore = req.getDirectorCreditScore() != null ? req.getDirectorCreditScore() : 0;
        if (directorScore < MIN_DIRECTOR_CREDIT_SCORE) {
            failures.add("Primary signatory's credit score of " + directorScore + " is below the minimum required score of " + MIN_DIRECTOR_CREDIT_SCORE + ".");
        }

        BigDecimal monthlyRevenue = req.getMonthlyRevenue();
        BigDecimal monthlyOutgoings = req.getMonthlyOutgoings() != null ? req.getMonthlyOutgoings() : BigDecimal.ZERO;
        BigDecimal netOperatingIncome = monthlyRevenue.subtract(monthlyOutgoings);

        // Standard loan amortisation for the requested amount/term
        BigDecimal monthlyRate = BASE_ANNUAL_RATE.divide(new BigDecimal("12"), MC);
        int n = req.getRequestedTermMonths();
        BigDecimal p = req.getRequestedLoanAmount();
        BigDecimal onePlusR = BigDecimal.ONE.add(monthlyRate);
        BigDecimal onePlusRpowN = onePlusR.pow(n, MC);
        BigDecimal calculatedRepayment = p.multiply(monthlyRate).multiply(onePlusRpowN)
                .divide(onePlusRpowN.subtract(BigDecimal.ONE), MC)
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal existingDebtService = req.getExistingBusinessDebtService() != null ? req.getExistingBusinessDebtService() : BigDecimal.ZERO;
        BigDecimal totalDebtService = existingDebtService.add(calculatedRepayment);

        BigDecimal dscr = totalDebtService.compareTo(BigDecimal.ZERO) > 0
                ? netOperatingIncome.divide(totalDebtService, MC).setScale(2, RoundingMode.HALF_UP)
                : new BigDecimal("99.00");

        if (dscr.compareTo(MIN_DSCR) < 0) {
            failures.add("Debt Service Coverage Ratio of " + dscr + " is below the minimum required " + MIN_DSCR + ".");
        }

        BigDecimal repaymentCapacity = netOperatingIncome.subtract(existingDebtService).setScale(2, RoundingMode.HALF_UP);

        String riskCategory = deriveRisk(dscr, directorScore);
        String creditCategory = deriveCreditCategory(directorScore);

        return BusinessAffordabilityResult.builder()
                .passed(failures.isEmpty())
                .dscr(dscr)
                .monthlyNetOperatingIncome(netOperatingIncome.setScale(2, RoundingMode.HALF_UP))
                .monthlyRepaymentCapacity(repaymentCapacity)
                .calculatedMonthlyRepayment(calculatedRepayment)
                .failureReasons(failures)
                .riskCategory(riskCategory)
                .creditScoreCategory(creditCategory)
                .build();
    }

    private String deriveRisk(BigDecimal dscr, int directorScore) {
        if (dscr.compareTo(new BigDecimal("1.75")) >= 0 && directorScore >= 8) return "LOW";
        if (dscr.compareTo(MIN_DSCR) >= 0) return "MEDIUM";
        return "HIGH";
    }

    private String deriveCreditCategory(int score) {
        if (score >= 8) return "EXCELLENT";
        if (score >= 7) return "GOOD";
        if (score >= 6) return "FAIR";
        return "POOR";
    }
}
