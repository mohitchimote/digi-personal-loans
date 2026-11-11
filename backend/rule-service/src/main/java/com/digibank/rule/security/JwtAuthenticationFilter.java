package com.digibank.rule.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.security.Key;
import java.util.Date;

/** Validates the JWT auth-service issues, from its signed claims alone (this service has no user table),
 * and rejects tokens issued before the user's last revocation. Same approach as the sibling services. */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    private final SessionRevocationCache sessionRevocationCache;

    public JwtAuthenticationFilter(SessionRevocationCache sessionRevocationCache) {
        this.sessionRevocationCache = sessionRevocationCache;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                Claims claims = Jwts.parserBuilder().setSigningKey(signingKey()).build()
                        .parseClaimsJws(header.substring(7)).getBody();
                boolean expired = claims.getExpiration() == null || claims.getExpiration().before(new Date());
                Long userId = claims.get("userId", Long.class);
                boolean revoked = claims.getIssuedAt() != null
                        && sessionRevocationCache.isRevoked(userId, claims.getIssuedAt().toInstant());
                AuthenticatedUser principal = AuthenticatedUser.fromClaims(claims);
                if (!expired && !revoked && principal != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                    SecurityContextHolder.getContext().setAuthentication(
                            new UsernamePasswordAuthenticationToken(principal, null, principal.authorities()));
                }
            } catch (Exception ignored) {
                // Invalid, expired or malformed: carry on unauthenticated; SecurityConfig rejects the request.
            }
        }
        chain.doFilter(request, response);
    }

    private Key signingKey() {
        return Keys.hmacShaKeyFor(Decoders.BASE64.decode(
                java.util.Base64.getEncoder().encodeToString(jwtSecret.getBytes())));
    }
}
