package com.digibank.affordability.observability;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Assigns every request a correlation ID — reused from the caller's X-Correlation-Id header when
 * present (i.e. this service was reached via api-gateway or another internal service that already
 * has one), generated fresh otherwise (this service was hit directly, e.g. in local dev). Put in
 * MDC so every log line for the request carries it (see logging.pattern.level in application.yml)
 * and echoed back on the response so a customer/support conversation can reference it.
 *
 * Registered via CorrelationIdConfig at the highest precedence so the ID exists for the
 * entire request lifecycle, including requests Spring Security rejects before reaching a
 * controller (S4, ARCHITECTURE_REVIEW_GAPS.md — makes the deck's "end-to-end request correlation"
 * claim true instead of removing it).
 */
public class CorrelationIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Correlation-Id";
    public static final String MDC_KEY = "correlationId";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String correlationId = request.getHeader(HEADER);
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = UUID.randomUUID().toString();
        }
        MDC.put(MDC_KEY, correlationId);
        response.setHeader(HEADER, correlationId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
