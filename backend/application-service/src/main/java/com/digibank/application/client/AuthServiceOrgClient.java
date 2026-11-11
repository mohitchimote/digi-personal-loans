package com.digibank.application.client;

import com.digibank.application.org.OrgUnitInfo;
import com.digibank.application.security.InternalKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.List;

/**
 * Client to auth-service for the org tree (the application-service owns no org table). Assumed
 * contract: GET {auth}/api/auth/internal/org/units, presenting X-Internal-Key, returning the flat list
 * [{id, parentId, levelId, name, code, active}]. Cached briefly like RuleServiceClient; if the call
 * fails the last good copy is used, and with none the list is empty (OrgScope then falls back to the
 * caller's own unit only).
 */
@Component
public class AuthServiceOrgClient {

    static final long CACHE_TTL_MS = 30_000;

    private final RestTemplate restTemplate;
    private final String authServiceUrl;
    private final String internalKey;

    private volatile List<OrgUnitInfo> cached = List.of();
    private volatile long cachedAt;

    public AuthServiceOrgClient(RestTemplate restTemplate, @Value("${app.auth-service.url}") String authServiceUrl,
                                @Value("${app.jwt.secret}") String jwtSecret) {
        this.internalKey = InternalKey.derive(jwtSecret);
        this.restTemplate = restTemplate;
        this.authServiceUrl = authServiceUrl;
    }

    private HttpHeaders keyHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.set(InternalKey.HEADER, internalKey);
        return h;
    }

    public List<OrgUnitInfo> units() {
        if (cachedAt != 0 && System.currentTimeMillis() - cachedAt < CACHE_TTL_MS) {
            return cached;
        }
        try {
            List<OrgUnitInfo> fetched = restTemplate.exchange(
                    authServiceUrl + "/api/auth/internal/org/units", HttpMethod.GET, new HttpEntity<>(keyHeaders()),
                    new ParameterizedTypeReference<List<OrgUnitInfo>>() {}).getBody();
            cached = fetched == null ? List.of() : List.copyOf(fetched);
            cachedAt = System.currentTimeMillis();
        } catch (RuntimeException e) {
            // keep the last good copy; retry on the next call rather than hammering a down service
            if (cachedAt == 0) return List.of();
        }
        return cached;
    }
}
