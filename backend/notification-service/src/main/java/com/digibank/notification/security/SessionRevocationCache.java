package com.digibank.notification.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * S2 (ARCHITECTURE_REVIEW_GAPS.md) — this service owns no user table, so a role change or account
 * disable on auth-service otherwise has zero effect here until the token's natural 24h expiry.
 * Polls auth-service's GET /api/auth/revoked-since every 30s and keeps a small in-memory cache
 * instead of a per-request call back to auth-service or Redis (both ruled out for this item) — a
 * bounded ~30s staleness window instead. See application-service's identically-shaped class for
 * the fuller rationale (single source, ported here since no shared module exists across services).
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
