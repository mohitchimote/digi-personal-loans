package com.digibank.application.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * S2 (ARCHITECTURE_REVIEW_GAPS.md) — this service owns no user table (see JwtAuthenticationFilter's
 * own javadoc: authentication is derived entirely from the token's signed claims, never a database
 * lookup), so a role change or account disable on auth-service otherwise has zero effect here until
 * the token's natural 24h expiry. Rather than a live per-request call back to auth-service (which
 * ARCHITECTURE.md §11.3 already argues against — no service should call back to auth-service to ask
 * a question per request) or Redis (explicitly ruled out for this item), this polls auth-service's
 * GET /api/auth/revoked-since every 30s and keeps a small in-memory cache — a bounded ~30s staleness
 * window instead of either alternative's cost.
 */
@Component
public class SessionRevocationCache {

    private final RestTemplate restTemplate;
    private final String authServiceUrl;

    private volatile Instant lastPolledAt = Instant.EPOCH;
    private final Map<Long, Instant> revokedAt = new ConcurrentHashMap<>();

    public SessionRevocationCache(RestTemplate restTemplate, @Value("${app.auth-service.url}") String authServiceUrl) {
        this.restTemplate = restTemplate;
        this.authServiceUrl = authServiceUrl;
    }

    @Scheduled(fixedRate = 30_000)
    public void poll() {
        Instant since = lastPolledAt;
        Instant pollStartedAt = Instant.now();
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.getForObject(
                    authServiceUrl + "/api/auth/revoked-since?since=" + since, Map.class);
            if (response == null) return;
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> entries = (List<Map<String, Object>>) response.get("data");
            if (entries == null) return;
            for (Map<String, Object> entry : entries) {
                Long userId = ((Number) entry.get("userId")).longValue();
                Instant revokedInstant = Instant.parse((String) entry.get("sessionsRevokedAt"));
                revokedAt.put(userId, revokedInstant);
            }
            // Only advance the watermark once the poll actually succeeded — a failed poll must
            // retry the same `since` next time rather than silently skipping the gap.
            lastPolledAt = pollStartedAt;
        } catch (Exception ignored) {
            // Best-effort — auth-service being briefly unreachable just means this service keeps
            // using its last-known-good cache rather than failing every request in the meantime.
        }
    }

    public boolean isRevoked(Long userId, Instant tokenIssuedAt) {
        if (userId == null) return false;
        Instant revokedInstant = revokedAt.get(userId);
        return revokedInstant != null && tokenIssuedAt.isBefore(revokedInstant);
    }
}
