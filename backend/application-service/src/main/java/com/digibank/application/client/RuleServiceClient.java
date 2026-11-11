package com.digibank.application.client;

import com.digibank.application.workflow.WorkflowUnavailableException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Client to rule-service (ARCHITECTURE_REVIEW_GAPS.md, G4) — internal-only, no gateway route, same as
 * AffordabilityClient's/DocumentClient's convention. The only thing asked of it now is the context mandate: the
 * largest amount a role may approve on a given case, from GET /internal/rules/mandates/resolve
 * ?role=&orgUnitId=&applicationType= which answers {limit, orgUnitId, applicationType} (the Worker's resolveMandate).
 * A null limit means no mandate row applies, that is, no approval authority. The enforcement of that limit when an
 * amount is approved is the workflow engine's MANDATE guard (workflow-service asks rule-service itself); this
 * service only shows the limit on the Decision tab. The old five-column rule bean and its endpoints are gone: the
 * mandates admin API is served by rule-service itself (gateway route mandates-admin).
 *
 * Cached briefly (10 s) so a screen does not cost a round trip per case; an admin edit lands within one window.
 */
@Component
public class RuleServiceClient {

    static final long CACHE_TTL_MS = 10_000;
    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};

    private record Cached(long at, Double limit) {}

    private final RestTemplate restTemplate;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    @Value("${app.rule-service.url}")
    private String ruleServiceUrl;

    public RuleServiceClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /** The mandate limit, or null when the role has no authority on this case. 503 when rule-service cannot be reached. */
    public Double resolveMandateLimit(String role, Long orgUnitId, String applicationType) {
        UriComponentsBuilder b = UriComponentsBuilder.fromUriString(ruleServiceUrl + "/internal/rules/mandates/resolve").queryParam("role", role);
        if (orgUnitId != null) b.queryParam("orgUnitId", orgUnitId);
        if (applicationType != null) b.queryParam("applicationType", applicationType);
        String url = b.build().toUriString();
        Cached c = cache.get(url);
        if (c != null && System.currentTimeMillis() - c.at() < CACHE_TTL_MS) return c.limit();
        try {
            Map<String, Object> body = restTemplate.exchange(url, org.springframework.http.HttpMethod.GET, null, MAP).getBody();
            Double limit = body != null && body.get("limit") instanceof Number n ? n.doubleValue() : null;
            cache.put(url, new Cached(System.currentTimeMillis(), limit));
            return limit;
        } catch (RestClientException e) {
            throw new WorkflowUnavailableException(e);
        }
    }
}
