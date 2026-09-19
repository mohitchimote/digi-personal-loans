package com.digibank.gateway.observability;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * The true entry point for correlation IDs on every browser-originated request — reuses an
 * incoming X-Correlation-Id if a caller already set one (e.g. a test/support tool), generates a
 * fresh one otherwise, adds it to both the proxied request (so every downstream service's own
 * CorrelationIdFilter picks it up) and the response (so a customer/support conversation can
 * reference it). This is the WebFlux/reactive equivalent of the servlet CorrelationIdFilter every
 * other service registers — Spring Cloud Gateway runs on WebFlux, not Spring MVC, so a
 * OncePerRequestFilter doesn't apply here (S4, ARCHITECTURE_REVIEW_GAPS.md).
 */
@Component
public class CorrelationIdGlobalFilter implements GlobalFilter, Ordered {

    public static final String HEADER = "X-Correlation-Id";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String correlationId = exchange.getRequest().getHeaders().getFirst(HEADER);
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = UUID.randomUUID().toString();
        }
        String finalCorrelationId = correlationId;

        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .header(HEADER, finalCorrelationId)
                .build();

        // The routed-to service echoes this same header back on its own response (its
        // CorrelationIdFilter), which the gateway proxies through untouched — so only add it here
        // for the cases where no downstream service got a chance to (route-not-found, a filter
        // rejecting the request before proxying, etc.), rather than ending up with it twice.
        return chain.filter(exchange.mutate().request(mutatedRequest).build())
                .then(Mono.fromRunnable(() -> {
                    if (exchange.getResponse().getHeaders().getFirst(HEADER) == null) {
                        exchange.getResponse().getHeaders().add(HEADER, finalCorrelationId);
                    }
                }));
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
