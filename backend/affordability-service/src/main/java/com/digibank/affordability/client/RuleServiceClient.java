package com.digibank.affordability.client;

import com.digibank.affordability.rules.AffordabilityRules;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/**
 * Client to rule-service (ARCHITECTURE_REVIEW_GAPS.md, G4) — internal-only, no gateway route.
 * Affordability thresholds are read on every /check assessment (via
 * rules.CachedAffordabilityRulesView), so results are cached briefly rather than round-tripping on
 * every request; an admin edit still lands within one cache window (10s) instead of requiring a
 * restart, unlike the old in-memory bean's "resets on restart" limitation it replaces.
 */
@Component
public class RuleServiceClient {

    private static final long CACHE_TTL_MS = 10_000;

    private final RestTemplate restTemplate;

    @Value("${app.rule-service.url}")
    private String ruleServiceUrl;

    private volatile AffordabilityRules cachedRules;
    private volatile long cachedAt;

    public RuleServiceClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public AffordabilityRules getAffordabilityRules() {
        AffordabilityRules cached = cachedRules;
        if (cached != null && System.currentTimeMillis() - cachedAt < CACHE_TTL_MS) {
            return cached;
        }
        AffordabilityRules fetched = restTemplate.getForObject(ruleServiceUrl + "/internal/rules/affordability", AffordabilityRules.class);
        cachedRules = fetched;
        cachedAt = System.currentTimeMillis();
        return fetched;
    }

    public AffordabilityRules updateAffordabilityRules(AffordabilityRules update) {
        AffordabilityRules updated = restTemplate.exchange(
                ruleServiceUrl + "/internal/rules/affordability", HttpMethod.PUT,
                new HttpEntity<>(update), AffordabilityRules.class).getBody();
        cachedRules = updated;
        cachedAt = System.currentTimeMillis();
        return updated;
    }
}
