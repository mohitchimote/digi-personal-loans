package com.digibank.workflow.security;

import io.jsonwebtoken.Claims;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * The JWT's claims, unpacked into the Authentication's principal: lets controllers read who is
 * actually making a request (role, fullName) without re-parsing authorities or trusting a
 * client-supplied "reviewedBy"/"editedBy" field, which is exactly what let a valid-but-junior token
 * forge a senior reviewer's name in the audit trail before this (PRODUCTION_READINESS.md §5).
 *
 * For staff the token also carries what their role lets them do (entitlements) and see (scope, org
 * unit) and their place on the escalation ladder (rank), because this service has no user or role
 * table of its own. auth-service puts these claims in at sign-in (see its TokenClaims). A customer's
 * token carries none of them.
 */
public record AuthenticatedUser(
        String uuid, Long userId, String role, String fullName,
        Set<String> entitlements, String scope, Long orgUnitId, Integer rank, String roleLabel, String email) {

    /** Authority prefix for an entitlement: the entitlement "case.decline" is the authority "PERM_case.decline". */
    public static final String PERMISSION_PREFIX = "PERM_";

    /** Falls back to the role when fullName is missing, mirroring the frontend's own
     * `auth.userFullName || 'Underwriter'` fallback so the audit trail's format doesn't change. */
    public String displayName() {
        return (fullName != null && !fullName.isBlank()) ? fullName : role;
    }

    /** Staff tokens carry their role's label; customer tokens (and staff whose role was deleted) do not. */
    public boolean isStaff() {
        return roleLabel != null;
    }

    public boolean has(String entitlement) {
        return entitlements.contains(entitlement);
    }

    /** ROLE_x (kept for the checks that still use roles) plus PERM_x for every entitlement held. */
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
        Number orgUnit = claims.get("orgUnitId", Number.class);
        Number rank = claims.get("rank", Number.class);
        return new AuthenticatedUser(
                claims.getSubject(), claims.get("userId", Long.class), role, claims.get("fullName", String.class),
                entitlements, claims.get("scope", String.class),
                orgUnit == null ? null : orgUnit.longValue(), rank == null ? null : rank.intValue(),
                claims.get("roleLabel", String.class), claims.get("email", String.class));
    }
}
