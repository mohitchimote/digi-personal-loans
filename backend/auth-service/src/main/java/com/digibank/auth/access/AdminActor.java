package com.digibank.auth.access;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/** Who is performing an admin action, for the audit trail. The principal's name is the user's uuid. */
public record AdminActor(String uuid, String role) {

    public static AdminActor current() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a == null) return new AdminActor(null, null);
        String role = a.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(x -> x.startsWith("ROLE_"))
                .findFirst()
                .map(x -> x.substring(5))
                .orElse(null);
        return new AdminActor(a.getName(), role);
    }
}
