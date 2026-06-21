package com.digibank.application.config;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Mutable, runtime-editable approval mandates — the maximum loan amount each role may approve
 * without referring the case up the chain. Admin-managed via /api/applications/mandate-rules.
 * Resets to defaults on service restart (same demo-only limitation as AffordabilityRules) — to
 * be backed by persistent storage post-selection.
 *
 * Hierarchy: UNDERWRITER -> SENIOR_UNDERWRITER -> HEAD_OF_LENDING -> COO -> CEO. CEO has no
 * practical ceiling (a very high default), since there is no one further to refer to.
 */
@Component
public class MandateRules {

    private BigDecimal underwriterLimit = new BigDecimal("100000");
    private BigDecimal seniorUnderwriterLimit = new BigDecimal("300000");
    private BigDecimal headOfLendingLimit = new BigDecimal("750000");
    private BigDecimal cooLimit = new BigDecimal("2000000");
    private BigDecimal ceoLimit = new BigDecimal("999999999");

    public BigDecimal getUnderwriterLimit() { return underwriterLimit; }
    public void setUnderwriterLimit(BigDecimal underwriterLimit) { this.underwriterLimit = underwriterLimit; }

    public BigDecimal getSeniorUnderwriterLimit() { return seniorUnderwriterLimit; }
    public void setSeniorUnderwriterLimit(BigDecimal seniorUnderwriterLimit) { this.seniorUnderwriterLimit = seniorUnderwriterLimit; }

    public BigDecimal getHeadOfLendingLimit() { return headOfLendingLimit; }
    public void setHeadOfLendingLimit(BigDecimal headOfLendingLimit) { this.headOfLendingLimit = headOfLendingLimit; }

    public BigDecimal getCooLimit() { return cooLimit; }
    public void setCooLimit(BigDecimal cooLimit) { this.cooLimit = cooLimit; }

    public BigDecimal getCeoLimit() { return ceoLimit; }
    public void setCeoLimit(BigDecimal ceoLimit) { this.ceoLimit = ceoLimit; }

    /** Looks up the limit for a role string (matches auth-service's User.role values). Unknown
     * roles get the most conservative (underwriter) limit rather than throwing, since this is
     * advisory UI gating, not a security boundary. */
    public BigDecimal limitFor(String role) {
        if (role == null) return underwriterLimit;
        return switch (role) {
            case "SENIOR_UNDERWRITER" -> seniorUnderwriterLimit;
            case "HEAD_OF_LENDING"    -> headOfLendingLimit;
            case "COO"                -> cooLimit;
            case "CEO"                -> ceoLimit;
            default                   -> underwriterLimit;
        };
    }
}
