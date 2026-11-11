package com.digibank.rule.directory;

import com.digibank.rule.security.InternalKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Reads auth-service's internal API (GET /api/auth/internal/org/units and /roles/ladder), presenting the
 * derived internal key. Answers are cached for a short while so a burst of resolves is one call, and a stale
 * answer is used when auth-service is briefly unreachable (an org tree changes rarely). With no answer at all,
 * it throws {@link DirectoryUnavailableException}.
 */
@Component
public class HttpAuthDirectory implements AuthDirectory {

    static final long TTL_MILLIS = 30_000;

    private final RestTemplate http;
    private final String baseUrl;
    private final String key;

    private final Cached<List<OrgUnitInfo>> units = new Cached<>();
    private final Cached<List<LadderRole>> ladder = new Cached<>();

    public HttpAuthDirectory(RestTemplate http, @Value("${app.auth-service.url}") String baseUrl,
                             @Value("${app.jwt.secret}") String jwtSecret) {
        this.http = http;
        this.baseUrl = baseUrl;
        this.key = InternalKey.derive(jwtSecret);
    }

    @Override
    public List<OrgUnitInfo> orgUnits() {
        return units.get(() -> get("/api/auth/internal/org/units").stream()
                .map(m -> new OrgUnitInfo(num(m.get("id")), num(m.get("parentId")))).toList());
    }

    @Override
    public List<LadderRole> ladder() {
        return ladder.get(() -> get("/api/auth/internal/roles/ladder").stream()
                .map(m -> new LadderRole((String) m.get("code"), (String) m.get("label"),
                        m.get("rank") == null ? null : ((Number) m.get("rank")).intValue())).toList());
    }

    private List<Map<String, Object>> get(String path) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(InternalKey.HEADER, key);
        List<Map<String, Object>> body = http.exchange(baseUrl + path, HttpMethod.GET, new HttpEntity<>(headers),
                new ParameterizedTypeReference<List<Map<String, Object>>>() {}).getBody();
        if (body == null) throw new IllegalStateException("empty answer from " + path);
        return body;
    }

    private static Long num(Object o) {
        return o == null ? null : ((Number) o).longValue();
    }

    /** One cached value: fresh for the TTL, kept as a fallback when a refresh fails. */
    private static final class Cached<T> {
        private volatile T value;
        private volatile long loadedAt;

        T get(Supplier<T> load) {
            T current = value;
            if (current != null && System.currentTimeMillis() - loadedAt < TTL_MILLIS) return current;
            try {
                T fresh = load.get();
                value = fresh;
                loadedAt = System.currentTimeMillis();
                return fresh;
            } catch (Exception e) {
                if (current != null) return current;
                throw new DirectoryUnavailableException("auth-service could not be reached", e);
            }
        }
    }
}
