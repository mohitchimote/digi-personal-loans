package com.digibank.rule.security;

import io.jsonwebtoken.Claims;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

/** The signed token's claims, unpacked. Only the mandate admin API is token-protected here, and the Worker
 * lets only the ADMIN role in, so the role, the name for the audit trail and the user id are all it needs. */
public record AuthenticatedUser(String uuid, Long userId, String role, String fullName, String email) {

    /** Same fallback the Worker's audit entries use: the full name, else the email address. */
    public String displayName() {
        if (fullName != null && !fullName.isBlank()) return fullName.trim();
        return email;
    }

    public List<GrantedAuthority> authorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role));
    }

    /** The principal for a validated token's claims, or null when the token names no role. */
    public static AuthenticatedUser fromClaims(Claims claims) {
        String role = claims.get("role", String.class);
        if (role == null) return null;
        return new AuthenticatedUser(claims.getSubject(), claims.get("userId", Long.class), role,
                claims.get("fullName", String.class), claims.get("email", String.class));
    }
}
