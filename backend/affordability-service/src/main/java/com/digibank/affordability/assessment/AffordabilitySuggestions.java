package com.digibank.affordability.assessment;

import java.math.BigDecimal;

/**
 * "What would fix it" figures for a failed capacity check, ported from worker/src/lib/affordability-calc.ts
 * (maxAffordableAmount, minAffordableTermMonths, MAX_TERM_MONTHS). Plain doubles, as in the Worker.
 */
final class AffordabilitySuggestions {

    /** Matches the frontend loan forms' own Validators.max(84). */
    static final int MAX_TERM_MONTHS = 84;

    private AffordabilitySuggestions() {}

    private static double round2(double n) {
        return Math.round(n * 100) / 100.0;
    }

    /** Given a fixed monthly budget and term, how much principal that budget can carry (inverse of the amortisation formula). */
    static BigDecimal maxAffordableAmount(double monthlyCapacity, double annualRate, int termMonths) {
        double r = annualRate / 12;
        if (monthlyCapacity <= 0) return BigDecimal.valueOf(0.0);
        if (r == 0) return BigDecimal.valueOf(round2(monthlyCapacity * termMonths));
        double onePlusRpowN = Math.pow(1 + r, termMonths);
        return BigDecimal.valueOf(round2((monthlyCapacity * (onePlusRpowN - 1)) / (r * onePlusRpowN)));
    }

    /**
     * The shortest term that keeps the payment within budget, or null when even the capped maximum term
     * cannot (the budget does not cover interest-only on this principal), meaning no term alone fixes it.
     */
    static Integer minAffordableTermMonths(double monthlyCapacity, double annualRate, double principal, int maxTermMonths) {
        if (monthlyCapacity <= 0 || principal <= 0) return null;
        double r = annualRate / 12;
        if (r == 0) {
            int term = (int) Math.ceil(principal / monthlyCapacity);
            return term <= maxTermMonths ? term : null;
        }
        double interestOnlyPayment = principal * r;
        if (monthlyCapacity <= interestOnlyPayment) return null;
        int term = (int) Math.ceil(Math.log(monthlyCapacity / (monthlyCapacity - interestOnlyPayment)) / Math.log(1 + r));
        return term <= maxTermMonths ? term : null;
    }

    /** A number as JavaScript prints it inside a message: no trailing zeros ("25.5", "40"), as the Worker's template literals do. */
    static String num(BigDecimal v) {
        BigDecimal s = v.stripTrailingZeros();
        return (s.scale() < 0 ? s.setScale(0) : s).toPlainString();
    }

    /** "TERMINAL" (hard stop) beats "STRUCTURAL" (ratios/income/score) beats "CAPACITY" (instalment too large); null when it passed. */
    static String failureType(boolean terminal, boolean structural, boolean capacity) {
        return terminal ? "TERMINAL" : structural ? "STRUCTURAL" : capacity ? "CAPACITY" : null;
    }
}
