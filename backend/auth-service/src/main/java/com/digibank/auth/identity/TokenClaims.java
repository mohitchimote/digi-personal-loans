package com.digibank.auth.identity;

import com.digibank.auth.access.EntitlementCatalog;
import com.digibank.auth.access.EntitlementDef;
import com.digibank.auth.access.RoleConfig;
import com.digibank.auth.model.User;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * What a signed token says about its holder. The other services validate tokens without a database of
 * their own, so everything they decide on has to travel inside the token: who the person is, and for
 * staff what their role lets them do (entitlements) and see (scope, org unit), plus their place on the
 * escalation ladder (rank). Customers carry only their identity: they hold no entitlements.
 *
 * Roles and entitlements are editable, so a token reflects them as of sign-in. When an admin changes a
 * role or a user, that user's earlier tokens are revoked (sessionsRevokedAt) and the next sign-in
 * carries the new values.
 */
public final class TokenClaims {

    private TokenClaims() {}

    public static Map<String, Object> forUser(User user, RoleConfig role) {
        // A mutable map on purpose: fullName has no NOT NULL constraint, and Map.of would throw on it.
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", user.getRole());
        claims.put("userId", user.getId());
        claims.put("fullName", user.getFullName());
        // Lets notification-service address a "test" email and attribute a template edit to a real address.
        claims.put("email", user.getEmail());
        if (role.isStaff()) {
            claims.put("roleLabel", role.label());
            claims.put("entitlements", inCatalogOrder(role));
            claims.put("scope", role.scope().name());
            if (role.rank() != null) claims.put("rank", role.rank());
            if (user.getOrgUnitId() != null) claims.put("orgUnitId", user.getOrgUnitId());
        }
        return claims;
    }

    /** Catalog order, so the same role always yields the same list (stable tokens, stable tests). */
    public static List<String> inCatalogOrder(RoleConfig role) {
        return EntitlementCatalog.ALL.stream().map(EntitlementDef::key).filter(role.entitlements()::contains).toList();
    }
}
