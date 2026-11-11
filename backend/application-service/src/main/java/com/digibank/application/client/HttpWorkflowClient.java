package com.digibank.application.client;

import com.digibank.application.config.ApiException;
import com.digibank.application.workflow.EvaluateRequest;
import com.digibank.application.workflow.Evaluation;
import com.digibank.application.workflow.QueueSettings;
import com.digibank.application.workflow.WorkflowActor;
import com.digibank.application.workflow.WorkflowUnavailableException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * RestTemplate implementation of {@link WorkflowClient}. The shared RestTemplate has short timeouts (3 s connect,
 * 8 s read), so a hung workflow-service fails the user's action quickly instead of holding it open. A network
 * failure, a timeout or a 5xx all become WorkflowUnavailableException (503); a 4xx (malformed request, an
 * idempotency key reused for another case) is passed on with workflow-service's own status and message. /internal
 * carries no token: it is only reachable service to service.
 */
@Component
public class HttpWorkflowClient implements WorkflowClient {

    private static final Logger log = LoggerFactory.getLogger(HttpWorkflowClient.class);
    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<Map<String, Map<String, Object>>> MAP_OF_MAPS = new ParameterizedTypeReference<>() {};

    private final RestTemplate http;
    private final ObjectMapper mapper;
    private final String baseUrl;

    public HttpWorkflowClient(RestTemplate http, ObjectMapper mapper, @Value("${app.workflow-service.url}") String baseUrl) {
        this.http = http;
        this.mapper = mapper;
        this.baseUrl = baseUrl;
    }

    private <T> T call(String what, Supplier<T> request) {
        try {
            return request.get();
        } catch (HttpClientErrorException e) {
            throw new ApiException(e.getStatusCode().value(), messageOf(e));
        } catch (RestClientException e) {
            log.warn("workflow-service call failed ({}): {}", what, e.getMessage());
            throw new WorkflowUnavailableException(e);
        }
    }

    private String messageOf(HttpClientErrorException e) {
        try {
            Object m = mapper.readValue(e.getResponseBodyAsString(), Map.class).get("message");
            if (m != null) return String.valueOf(m);
        } catch (Exception ignored) {
            // not JSON: fall through
        }
        return "The request to the workflow service was refused.";
    }

    private HttpEntity<Object> json(Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    @Override
    public Map<String, Object> register(String applicationRef, Map<String, Object> summary) {
        return call("register", () -> http.exchange(baseUrl + "/internal/workflow/cases/{ref}", HttpMethod.PUT, json(summary), MAP, applicationRef).getBody());
    }

    @Override
    public Map<String, Object> backfill(List<Map<String, Object>> cases) {
        return call("backfill", () -> http.exchange(baseUrl + "/internal/workflow/backfill", HttpMethod.POST, json(Map.of("cases", cases)), MAP).getBody());
    }

    @Override
    public Evaluation evaluate(String applicationRef, EvaluateRequest request) {
        Map<String, Object> body = call("evaluate " + request.action(),
                () -> http.exchange(baseUrl + "/internal/workflow/cases/{ref}/evaluate", HttpMethod.POST, json(request.toMap()), MAP, applicationRef).getBody());
        if (body == null) throw new WorkflowUnavailableException(null);
        return Evaluation.fromMap(body);
    }

    @Override
    public Map<String, Map<String, Object>> info(Collection<String> applicationRefs) {
        if (applicationRefs.isEmpty()) return Map.of();
        Map<String, Map<String, Object>> out = call("info",
                () -> http.exchange(baseUrl + "/internal/workflow/info", HttpMethod.POST, json(Map.of("refs", new ArrayList<>(applicationRefs))), MAP_OF_MAPS).getBody());
        return out == null ? Map.of() : out;
    }

    @Override
    @SuppressWarnings("unchecked")
    public QueueSettings resolveQueue(List<String> keys, WorkflowActor actor) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("keys", keys);
        body.put("actor", actor.toMap());
        Map<String, Object> r = call("queues/resolve",
                () -> http.exchange(baseUrl + "/internal/workflow/queues/resolve", HttpMethod.POST, json(body), MAP).getBody());
        if (r == null) throw new WorkflowUnavailableException(null);
        List<String> statuses = r.get("statuses") instanceof List<?> l ? ((List<Object>) l).stream().map(String::valueOf).toList() : List.of();
        return new QueueSettings((String) r.get("queue"), statuses, Boolean.TRUE.equals(r.get("applyScope")), Boolean.TRUE.equals(r.get("hideReferredAbove")));
    }

    @Override
    public Map<String, Object> actionsFor(String applicationRef, String authorizationHeader) {
        if (authorizationHeader == null) return null;
        try {
            HttpHeaders h = new HttpHeaders();
            h.set(HttpHeaders.AUTHORIZATION, authorizationHeader);
            return http.exchange(baseUrl + "/api/workflow/cases/{ref}/actions", HttpMethod.GET, new HttpEntity<>(h), MAP, applicationRef).getBody();
        } catch (RestClientException e) {
            // Listing what is offered next is a convenience: the action has already committed.
            log.warn("Could not list the next actions for {}: {}", applicationRef, e.getMessage());
            return null;
        }
    }
}
