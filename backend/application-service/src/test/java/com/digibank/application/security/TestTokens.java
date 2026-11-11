package com.digibank.application.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;

import java.util.*;

/** Real signed tokens, shaped as auth-service issues them, for tests that drive the real security chain. */
final class TestTokens {

    static final String SECRET = "test-secret-test-secret-test-secret-0123456789";

    private TestTokens() {}

    static String customer(long userId) {
        return build(Map.of("role", "CUSTOMER", "userId", userId, "fullName", "Customer " + userId));
    }

    /** A staff token: role label, entitlements, scope and (optionally) an org unit, as the token carries them. */
    static String staff(long userId, String role, String scope, Long orgUnitId, String... entitlements) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", role);
        claims.put("userId", userId);
        claims.put("fullName", "Staff " + userId);
        claims.put("email", "staff" + userId + "@digibank.test");
        claims.put("roleLabel", role);
        claims.put("entitlements", new ArrayList<>(List.of(entitlements)));
        claims.put("scope", scope);
        if (orgUnitId != null) claims.put("orgUnitId", orgUnitId);
        return build(claims);
    }

    static String build(Map<String, Object> claims) {
        Date now = new Date();
        return Jwts.builder().setClaims(new HashMap<>(claims)).setSubject("uuid").setIssuedAt(now)
                .setExpiration(new Date(now.getTime() + 3_600_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes()), SignatureAlgorithm.HS256).compact();
    }
}
