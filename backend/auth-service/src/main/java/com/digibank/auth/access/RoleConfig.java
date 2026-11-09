package com.digibank.auth.access;

import java.util.Set;

/**
 * A role as the rest of the system sees it: what it may do and which cases it may see. Resolved from
 * the roles tables when a token is issued; unknown codes (customers, or a deleted role) hold nothing.
 */
public record RoleConfig(String code, String label, boolean isStaff, Scope scope, Integer rank, Set<String> entitlements) {

    public static RoleConfig notStaff(String code) {
        return new RoleConfig(code, code, false, Scope.ALL, null, Set.of());
    }
}
