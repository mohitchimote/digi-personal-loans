package com.digibank.auth.internal;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/** Authenticates a service-to-service call that presents the right X-Internal-Key, as ROLE_INTERNAL_SERVICE.
 * It only ever acts on /api/auth/internal paths. A wrong or missing key is not an error here: the request just
 * stays unauthenticated (or keeps whatever its bearer token proved) and SecurityConfig decides. */
@Component
public class InternalKeyFilter extends OncePerRequestFilter {

    public static final String ROLE = "INTERNAL_SERVICE";

    private final String expected;

    public InternalKeyFilter(@Value("${app.jwt.secret}") String jwtSecret) {
        this.expected = InternalKey.derive(jwtSecret);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/auth/internal/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() == null
                && InternalKey.matches(expected, request.getHeader(InternalKey.HEADER))) {
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                    "internal-service", null, List.of(new SimpleGrantedAuthority("ROLE_" + ROLE))));
        }
        chain.doFilter(request, response);
    }
}
