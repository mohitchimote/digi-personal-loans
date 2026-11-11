package com.digibank.auth.internal;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;

import java.util.Set;

/** Who may call /api/auth/internal: another service presenting the internal key, or signed-in staff. Never a
 * customer, never an anonymous caller. (Staff means a role that is not one of the customer roles.) */
public final class InternalAccess {

    private static final Set<String> NOT_STAFF = Set.of("CUSTOMER", "BUSINESS_OWNER", "ANONYMOUS");

    private InternalAccess() {}

    public static boolean permits(Authentication a) {
        if (a == null || !a.isAuthenticated()) return false;
        for (GrantedAuthority g : a.getAuthorities()) {
            String name = g.getAuthority();
            if (!name.startsWith("ROLE_")) continue;
            String role = name.substring(5);
            if (role.equals(InternalKeyFilter.ROLE) || !NOT_STAFF.contains(role)) return true;
        }
        return false;
    }
}
