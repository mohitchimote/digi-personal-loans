package com.digibank.document.security;

import io.jsonwebtoken.Claims;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * The JWT's claims, unpacked into the Authentication's principal. This service owns no user or role
 * table, so what a person may do travels in the token: auth-service puts the role's label and its
 * entitlements in at sign-in (see its TokenClaims). A customer's token carries neither.
 */
public record AuthenticatedUser(String uuid, Long userId, String role, String roleLabel, Set<String> entitlements) {

    /** Authority prefix for an entitlement: "case.decline" is the authority "PERM_case.decline". */
    public static final String PERMISSION_PREFIX = "PERM_";

    /** Staff tokens carry their role's label; customer tokens (and staff whose role was deleted) do not. */
    public boolean isStaff() {
        return roleLabel != null;
    }

    public boolean has(String entitlement) {
        return entitlements.contains(entitlement);
    }

    /** ROLE_x plus PERM_x for every entitlement held. */
    public List<GrantedAuthority> authorities() {
        List<GrantedAuthority> out = new ArrayList<>();
        out.add(new SimpleGrantedAuthority("ROLE_" + role));
        for (String e : entitlements) out.add(new SimpleGrantedAuthority(PERMISSION_PREFIX + e));
        return out;
    }

    /** The principal for a validated token's claims, or null when the token names no role. */
    public static AuthenticatedUser fromClaims(Claims claims) {
        String role = claims.get("role", String.class);
        if (role == null) return null;
        List<?> raw = claims.get("entitlements", List.class);
        Set<String> entitlements = raw == null ? Set.of() : Set.copyOf(raw.stream().map(String::valueOf).toList());
        return new AuthenticatedUser(claims.getSubject(), claims.get("userId", Long.class), role, claims.get("roleLabel", String.class), entitlements);
    }
}
