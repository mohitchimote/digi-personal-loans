package com.digibank.application.client;

import com.digibank.application.security.InternalKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * The escalation ladder (roles that have a rank), from auth-service: GET {auth}/api/auth/internal/roles/ladder,
 * presenting X-Internal-Key, returning [{code,label,rank}] (a {"data": ...} wrapper is accepted too). Used only to
 * display the Decision tab (next role, referral lock label) and to filter queues; the engine in workflow-service
 * enforces the lock and the referral target itself. Cached for 10 s like the other directory reads; if auth-service
 * cannot be reached the last good copy is used, and with none the ladder is empty (no next role, nothing hidden).
 */
@Component
public class RoleLadderClient {

    public record LadderRole(String code, String label, int rank) {}

    static final long CACHE_TTL_MS = 10_000;

    private final RestTemplate http;
    private final String authServiceUrl;
    private final String internalKey;

    private volatile List<LadderRole> cached = List.of();
    private volatile long cachedAt;

    public RoleLadderClient(RestTemplate http, @Value("${app.auth-service.url}") String authServiceUrl, @Value("${app.jwt.secret}") String jwtSecret) {
        this.http = http;
        this.authServiceUrl = authServiceUrl;
        this.internalKey = InternalKey.derive(jwtSecret);
    }

    @SuppressWarnings("unchecked")
    public List<LadderRole> ladder() {
        if (cachedAt != 0 && System.currentTimeMillis() - cachedAt < CACHE_TTL_MS) return cached;
        try {
            HttpHeaders h = new HttpHeaders();
            h.set(InternalKey.HEADER, internalKey);
            Object body = http.exchange(authServiceUrl + "/api/auth/internal/roles/ladder", HttpMethod.GET, new HttpEntity<>(h),
                    new ParameterizedTypeReference<Object>() {}).getBody();
            if (body instanceof Map<?, ?> m && m.get("data") != null) body = m.get("data");
            List<LadderRole> out = new java.util.ArrayList<>();
            if (body instanceof List<?> l) {
                for (Object o : l) {
                    Map<String, Object> m = (Map<String, Object>) o;
                    if (m.get("rank") instanceof Number rank) out.add(new LadderRole((String) m.get("code"), (String) m.get("label"), rank.intValue()));
                }
            }
            cached = List.copyOf(out);
            cachedAt = System.currentTimeMillis();
        } catch (RuntimeException e) {
            // keep the last good copy; retry on the next call rather than hammering a down service
        }
        return cached;
    }
}
