package com.digibank.workflow.client;

import com.digibank.workflow.client.Directory.Ladder;
import com.digibank.workflow.client.Directory.Mandates;
import com.digibank.workflow.client.Directory.Org;
import com.digibank.workflow.client.Directory.OrgUnit;
import com.digibank.workflow.client.Directory.Staff;
import com.digibank.workflow.client.Directory.StaffMember;
import com.digibank.workflow.client.Directory.UpstreamUnavailableException;
import com.digibank.workflow.engine.Js;
import com.digibank.workflow.engine.Model.LadderRole;
import com.digibank.workflow.security.InternalKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * HTTP implementations of the directory interfaces: rule-service for mandates, auth-service for the
 * role ladder, org tree and staff. Internal-only endpoints (no gateway route), cached briefly like
 * application-service's RuleServiceClient so a screen does not cost a round trip per case; an admin edit
 * still lands within one cache window. A response may be the bare JSON or wrapped as {"data": ...}.
 */
@Component
public class HttpDirectory implements Mandates, Ladder, Org, Staff {

    static final long TTL_MS = 10_000;

    private final RestTemplate http;
    private final String ruleUrl;
    private final String authUrl;
    private final String internalKey;

    private record Cached(long at, Object value) {}
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    public HttpDirectory(RestTemplate http, @Value("${app.rule-service.url}") String ruleUrl, @Value("${app.auth-service.url}") String authUrl,
                         @Value("${app.jwt.secret}") String jwtSecret) {
        this.internalKey = InternalKey.derive(jwtSecret);
        this.http = http;
        this.ruleUrl = ruleUrl;
        this.authUrl = authUrl;
    }

    @SuppressWarnings("unchecked")
    private <T> T cached(String key, Supplier<T> load) {
        Cached c = cache.get(key);
        if (c != null && System.currentTimeMillis() - c.at() < TTL_MS) return (T) c.value();
        T v = load.get();
        cache.put(key, new Cached(System.currentTimeMillis(), v));
        return v;
    }

    private Object fetch(String url) {
        try {
            HttpHeaders headers = new HttpHeaders();
            if (url.startsWith(authUrl)) headers.set(InternalKey.HEADER, internalKey);
            Object body = http.exchange(url, HttpMethod.GET, new HttpEntity<>(headers), Object.class).getBody();
            Map<String, Object> m = Js.map(body);
            return m != null && m.containsKey("data") && !m.containsKey("limit") ? m.get("data") : body;
        } catch (Exception e) {
            throw new UpstreamUnavailableException("Could not reach " + url.replaceAll("\\?.*", ""), e);
        }
    }

    private static long asLong(Object o) { return ((Number) o).longValue(); }

    private static Long asLongOrNull(Object o) { return o instanceof Number n ? n.longValue() : null; }

    @Override
    public Double limit(String role, Long orgUnitId, String applicationType) {
        UriComponentsBuilder b = UriComponentsBuilder.fromUriString(ruleUrl + "/internal/rules/mandates/resolve").queryParam("role", role);
        if (orgUnitId != null) b.queryParam("orgUnitId", orgUnitId);
        if (applicationType != null) b.queryParam("applicationType", applicationType);
        String url = b.build().toUriString();
        return cached("mandate:" + url, () -> {
            Map<String, Object> m = Js.map(fetch(url));
            return m != null && m.get("limit") instanceof Number n ? n.doubleValue() : null;
        });
    }

    @Override
    public List<LadderRole> ladder() {
        return cached("ladder", () -> {
            List<LadderRole> out = new ArrayList<>();
            for (Object o : Js.listOrEmpty(fetch(authUrl + "/api/auth/internal/roles/ladder"))) {
                Map<String, Object> m = Js.map(o);
                if (m.get("rank") instanceof Number rank) out.add(new LadderRole((String) m.get("code"), (String) m.get("label"), rank.intValue()));
            }
            return out;
        });
    }

    @Override
    public List<OrgUnit> units() {
        return cached("units", () -> {
            List<OrgUnit> out = new ArrayList<>();
            for (Object o : Js.listOrEmpty(fetch(authUrl + "/api/auth/internal/org/units"))) {
                Map<String, Object> m = Js.map(o);
                out.add(new OrgUnit(asLong(m.get("id")), asLongOrNull(m.get("parentId")), asLongOrNull(m.get("levelId")),
                        (String) m.get("name"), (String) m.get("code"), !Boolean.FALSE.equals(m.get("active"))));
            }
            return out;
        });
    }

    @Override
    public List<StaffMember> staff(Collection<String> roles, Collection<Long> orgUnitIds) {
        UriComponentsBuilder b = UriComponentsBuilder.fromUriString(authUrl + "/api/auth/internal/staff");
        if (roles != null && !roles.isEmpty()) b.queryParam("role", String.join(",", roles));
        if (orgUnitIds != null && !orgUnitIds.isEmpty()) b.queryParam("orgUnitIds", String.join(",", orgUnitIds.stream().map(String::valueOf).toList()));
        String url = b.build().toUriString();
        return cached("staff:" + url, () -> {
            List<StaffMember> out = new ArrayList<>();
            for (Object o : Js.listOrEmpty(fetch(url))) {
                Map<String, Object> m = Js.map(o);
                List<String> ents = m.get("entitlements") == null ? null : Js.listOrEmpty(m.get("entitlements")).stream().map(String::valueOf).toList();
                out.add(new StaffMember(asLong(m.get("userId")), (String) m.get("uuid"), (String) m.get("fullName"), (String) m.get("role"),
                        asLongOrNull(m.get("orgUnitId")), !Boolean.FALSE.equals(m.get("available")), (String) m.get("scope"), ents));
            }
            return out;
        });
    }
}
