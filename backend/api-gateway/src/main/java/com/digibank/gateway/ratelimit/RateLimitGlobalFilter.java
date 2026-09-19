package com.digibank.gateway.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

/**
 * S5 (ARCHITECTURE_REVIEW_GAPS.md) — no gateway-level rate limiting existed before this. Spring
 * Cloud Gateway's built-in RequestRateLimiter needs Redis (RedisRateLimiter, Lua-script-backed);
 * Redis was explicitly ruled out for this item, so this is an in-memory token bucket
 * (bucket4j) keyed by client IP instead — per-instance limits, not cluster-wide, a known and
 * stated tradeoff of the no-Redis decision (fine for the current single-instance target).
 *
 * Two tiers: a tight one for /api/auth/login/** and /api/auth/register/** (the actual
 * brute-force/OTP-abuse target) and a generous baseline for everything else.
 */
@Component
public class RateLimitGlobalFilter implements GlobalFilter, Ordered {

    private static final int AUTH_CAPACITY = 10;
    private static final Duration AUTH_REFILL_PERIOD = Duration.ofMinutes(1);

    private static final int BASELINE_CAPACITY = 120;
    private static final Duration BASELINE_REFILL_PERIOD = Duration.ofMinutes(1);

    private final Map<String, Bucket> authBuckets = new ConcurrentHashMap<>();
    private final Map<String, Bucket> baselineBuckets = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getPath().value();
        String clientIp = resolveClientIp(request);

        boolean isAuthPath = path.startsWith("/api/auth/login") || path.startsWith("/api/auth/register");
        Map<String, Bucket> buckets = isAuthPath ? authBuckets : baselineBuckets;
        Function<String, Bucket> bucketFactory = isAuthPath ? this::newAuthBucket : this::newBaselineBucket;
        Bucket bucket = buckets.computeIfAbsent(clientIp, bucketFactory);

        if (bucket.tryConsume(1)) {
            return chain.filter(exchange);
        }

        return tooManyRequests(exchange);
    }

    private Bucket newAuthBucket(String ip) {
        return Bucket.builder()
                .addLimit(Bandwidth.classic(AUTH_CAPACITY, Refill.greedy(AUTH_CAPACITY, AUTH_REFILL_PERIOD)))
                .build();
    }

    private Bucket newBaselineBucket(String ip) {
        return Bucket.builder()
                .addLimit(Bandwidth.classic(BASELINE_CAPACITY, Refill.greedy(BASELINE_CAPACITY, BASELINE_REFILL_PERIOD)))
                .build();
    }

    private String resolveClientIp(ServerHttpRequest request) {
        // Same header a real deploy's load balancer/WAF would set (PRODUCTION_READINESS.md §2/§4)
        // — falls back to the direct remote address for local dev, where nothing sits in front.
        String forwardedFor = request.getHeaders().getFirst("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        InetSocketAddress remoteAddress = request.getRemoteAddress();
        return remoteAddress != null && remoteAddress.getAddress() != null
                ? remoteAddress.getAddress().getHostAddress()
                : "unknown";
    }

    private Mono<Void> tooManyRequests(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("message", "Too many requests. Please try again shortly.");
        body.put("data", null);
        byte[] bytes;
        try {
            bytes = objectMapper.writeValueAsBytes(body);
        } catch (Exception e) {
            bytes = "{\"success\":false,\"message\":\"Too many requests.\"}".getBytes(StandardCharsets.UTF_8);
        }
        DataBuffer buffer = exchange.getResponse().bufferFactory().wrap(bytes);
        return exchange.getResponse().writeWith(Mono.just(buffer));
    }

    @Override
    public int getOrder() {
        // After correlation ID (HIGHEST_PRECEDENCE) so a 429 response still carries one.
        return Ordered.HIGHEST_PRECEDENCE + 1;
    }
}
