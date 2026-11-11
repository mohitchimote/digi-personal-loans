package com.digibank.rule.mandates;

/** The body of POST and PUT: {roleCode, orgUnitId|null, applicationType "PERSONAL"|"BUSINESS"|null, maxAmount}. */
public record MandateRequest(String roleCode, Long orgUnitId, String applicationType, Double maxAmount) {

    static final double MAX = 1e12;

    /** The Worker's zod schema: a role code, an optional unit and type, and an amount from 0 to 1e12. */
    void check() {
        if (roleCode == null || roleCode.isEmpty()) throw new MandateApiException("roleCode: is required");
        if (applicationType != null && !applicationType.equals("PERSONAL") && !applicationType.equals("BUSINESS")) {
            throw new MandateApiException("applicationType: must be PERSONAL, BUSINESS or null");
        }
        if (maxAmount == null || maxAmount.isNaN() || maxAmount < 0 || maxAmount > MAX) {
            throw new MandateApiException("maxAmount: must be a number from 0 to 1000000000000");
        }
    }
}
