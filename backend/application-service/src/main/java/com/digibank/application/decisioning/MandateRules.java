package com.digibank.application.decisioning;

import java.math.BigDecimal;

/**
 * Wire shape for rule-service's GET/PUT /internal/rules/mandates — the maximum loan amount each
 * role may approve without referring the case up the chain. Fetched/updated via
 * client.RuleServiceClient (ARCHITECTURE_REVIEW_GAPS.md, G4); no longer a Spring-managed bean
 * holding state itself — rule-service persists it now (G6), this is just the deserialized value.
 *
 * Hierarchy: UNDERWRITER -> SENIOR_UNDERWRITER -> HEAD_OF_LENDING -> COO -> CEO. CEO has no
 * practical ceiling (a very high default), since there is no one further to refer to.
 *
 * Server-side enforcement lives in DecisioningService.approveApplicationByUnderwriter() — this
 * used to be advisory-only (client-side UI gating), which let a valid-but-junior token approve
 * any amount directly against the API (PRODUCTION_READINESS.md §5, fixed 2026-08-28).
 */
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

    /** Looks up the limit for a role string (matches auth-service's User.role values). BANKER and
     * ADMIN are staff roles for other purposes (assisted origination, back-office config) but
     * hold no approval mandate of their own — falling back to underwriterLimit here used to let
     * either one approve up to that amount, which is wrong: only the five-tier underwriting
     * hierarchy can approve at all. Any unrecognized role, including null, gets zero. */
    public BigDecimal limitFor(String role) {
        if (role == null) return BigDecimal.ZERO;
        return switch (role) {
            case "UNDERWRITER"        -> underwriterLimit;
            case "SENIOR_UNDERWRITER" -> seniorUnderwriterLimit;
            case "HEAD_OF_LENDING"    -> headOfLendingLimit;
            case "COO"                -> cooLimit;
            case "CEO"                -> ceoLimit;
            default                   -> BigDecimal.ZERO;
        };
    }
}
