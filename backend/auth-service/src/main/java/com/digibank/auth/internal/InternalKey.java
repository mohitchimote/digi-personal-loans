package com.digibank.auth.internal;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

/**
 * The credential other services present on their calls to /api/auth/internal (header X-Internal-Key). It is
 * derived from the JWT secret every service already shares, so it needs no new configuration and only a holder
 * of that secret can compute it. rule-service has the identical derivation; any other caller derives it the same way:
 * hex(HMAC-SHA256(key = JWT secret, message = "digibank-internal-api-v1")).
 */
public final class InternalKey {

    public static final String HEADER = "X-Internal-Key";

    private InternalKey() {}

    public static String derive(String jwtSecret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal("digibank-internal-api-v1".getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Constant-time comparison, so the check leaks nothing about how much of a guess was right. */
    public static boolean matches(String expected, String presented) {
        if (presented == null) return false;
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), presented.getBytes(StandardCharsets.UTF_8));
    }
}
