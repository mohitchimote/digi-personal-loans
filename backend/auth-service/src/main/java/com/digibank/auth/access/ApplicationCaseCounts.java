package com.digibank.auth.access;

import com.digibank.auth.internal.InternalKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * Asks application-service how many cases an org unit holds: GET /api/applications/internal/org-units/{id}/case-count
 * answering {"count": n}, presenting the derived internal key. Fails safe: when the answer cannot be had, the
 * delete is refused with a clear message (503) instead of being allowed on the assumption of "no cases".
 * (The Worker reads its own cases table, so it has no equivalent failure.)
 */
@Component
public class ApplicationCaseCounts implements OrgUnitUsage {

    static final String UNAVAILABLE = "Cannot confirm whether this unit has cases right now (the application service did not answer), "
            + "so it was not deleted. Try again shortly.";

    private final RestTemplate http;
    private final String baseUrl;
    private final String key;

    public ApplicationCaseCounts(RestTemplate http, @Value("${app.application-service.url}") String baseUrl,
                                 @Value("${app.jwt.secret}") String jwtSecret) {
        this.http = http;
        this.baseUrl = baseUrl;
        this.key = InternalKey.derive(jwtSecret);
    }

    @Override
    public long caseCount(long orgUnitId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set(InternalKey.HEADER, key);
            Map<String, Object> body = http.exchange(baseUrl + "/api/applications/internal/org-units/" + orgUnitId + "/case-count",
                    HttpMethod.GET, new HttpEntity<>(headers), new ParameterizedTypeReference<Map<String, Object>>() {}).getBody();
            if (body == null || !(body.get("count") instanceof Number count) || count.longValue() < 0) {
                throw new IllegalStateException("unexpected answer: " + body);
            }
            return count.longValue();
        } catch (Exception e) {
            throw new AdminApiException(UNAVAILABLE, 503);
        }
    }
}
