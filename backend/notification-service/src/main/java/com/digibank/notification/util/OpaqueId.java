package com.digibank.notification.util;

import java.math.BigInteger;

/**
 * S6 (ARCHITECTURE_REVIEW_GAPS.md) — API-boundary id obfuscation, deliberately not a schema
 * migration: internal auto-increment PKs are unchanged; only what crosses the API boundary (JSON
 * responses, path params) is opaque. Obfuscation against casual enumeration/business-intelligence
 * leakage, not cryptographic security — see document-service's identical class for the full
 * rationale. Duplicated per service rather than shared — no cross-service Java module exists yet
 * (Q2 note, ARCHITECTURE_REVIEW_GAPS.md).
 */
public final class OpaqueId {
    private OpaqueId() {}

    private static final BigInteger PRIME = BigInteger.valueOf(4294967311L);
    private static final BigInteger MULTIPLIER = BigInteger.valueOf(2654435761L);
    private static final BigInteger MULTIPLIER_INV = MULTIPLIER.modPow(PRIME.subtract(BigInteger.TWO), PRIME);

    public static String encode(String prefix, Long id) {
        if (id == null) return null;
        BigInteger obfuscated = BigInteger.valueOf(id).multiply(MULTIPLIER).mod(PRIME);
        return prefix + "_" + obfuscated.toString(36);
    }

    public static Long decode(String prefix, String opaque) {
        String expectedPrefix = prefix + "_";
        if (opaque == null || !opaque.startsWith(expectedPrefix)) {
            throw new IllegalArgumentException("Invalid id: " + opaque);
        }
        try {
            BigInteger obfuscated = new BigInteger(opaque.substring(expectedPrefix.length()), 36);
            if (obfuscated.signum() < 0 || obfuscated.compareTo(PRIME) >= 0) {
                throw new IllegalArgumentException("Invalid id: " + opaque);
            }
            return obfuscated.multiply(MULTIPLIER_INV).mod(PRIME).longValueExact();
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid id: " + opaque);
        }
    }
}
