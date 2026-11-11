package com.digibank.rule.security;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

/**
 * The credential this service presents on its internal calls to auth-service (header X-Internal-Key). It is
 * derived from the JWT secret every service already shares, so it needs no new configuration: only a holder
 * of that secret can compute it. auth-service has the identical class and checks it in constant time.
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
}
