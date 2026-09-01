package com.digibank.notification.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Matches worker/src/middleware/auth.ts's requireAuth response exactly, so the frontend sees one
 * consistent contract regardless of which backend answered: 401 + this exact message for
 * "no/invalid/expired token" — never a bare, unlabelled 403 that Spring Security's default would
 * otherwise return here (see PRODUCTION_READINESS.md §5's JWT-expiry follow-up).
 */
@Component
public class JsonAuthenticationEntryPoint implements AuthenticationEntryPoint {
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                          AuthenticationException authException) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"success\":false,\"message\":\"Token is invalid or expired.\",\"data\":null}");
    }
}
