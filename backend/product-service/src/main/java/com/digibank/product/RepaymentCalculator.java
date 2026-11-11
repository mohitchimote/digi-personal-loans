package com.digibank.product;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/**
 * Standard loan amortisation math, shared by all three contexts in this service (catalog's
 * eligibility quotes, preapproved's offer seeding, selection's repayment quote) — not a domain of
 * its own, same reasoning as application-service's client/ package (ARCHITECTURE.md §10).
 */
public final class RepaymentCalculator {

    private static final MathContext MC = new MathContext(10, RoundingMode.HALF_UP);

    private RepaymentCalculator() {}

    public static BigDecimal monthlyRepayment(BigDecimal annualRate, BigDecimal principal, int termMonths) {
        // A zero rate makes the amortisation formula 0/0; the instalment is then simply principal / term.
        if (annualRate.signum() == 0) return principal.divide(new BigDecimal(termMonths), 2, RoundingMode.HALF_UP);
        BigDecimal monthlyRate = annualRate.divide(new BigDecimal("1200"), MC);
        BigDecimal onePlusR = BigDecimal.ONE.add(monthlyRate);
        BigDecimal onePlusRpowN = onePlusR.pow(termMonths, MC);
        return principal.multiply(monthlyRate).multiply(onePlusRpowN)
                .divide(onePlusRpowN.subtract(BigDecimal.ONE), MC)
                .setScale(2, RoundingMode.HALF_UP);
    }
}
