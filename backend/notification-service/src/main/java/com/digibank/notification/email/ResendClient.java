package com.digibank.notification.email;

import com.digibank.notification.resilience.CircuitBreaker;
import com.digibank.notification.resilience.CircuitOpenException;
import com.digibank.notification.resilience.Retry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Thin wrapper around Resend's HTTP API, port of worker/src/lib/email.ts's deliverEmail — now
 * including that same file's timeout + bounded retry + circuit breaker, since this is the one
 * genuine third-party call in the whole backend (everything else is service-to-service). A 5xx or
 * a network/timeout error is plausibly transient; a 4xx (bad request, invalid key, rate-limited)
 * will not be fixed by retrying with the same payload. Callers decide whether a failure should be
 * swallowed (production sends, via EmailDeliveryService) or surfaced (the admin "send test"
 * action, via EmailTemplateAdminService).
 */
@Component
public class ResendClient {

    private final RestTemplate restTemplate;

    @Value("${app.resend.api-key:}")
    private String resendApiKey;

    @Value("${app.resend.from-email:}")
    private String resendFromEmail;

    // Module-scope (one instance per service process) so it persists across requests: 5
    // consecutive failures trips it open for 30s, giving Resend room to recover and sparing
    // callers the cost of a doomed request during an outage.
    private final CircuitBreaker breaker = new CircuitBreaker(5, 30_000);

    public ResendClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    private static class ResendResponseException extends RuntimeException {
        final boolean retryable;
        ResendResponseException(String message, boolean retryable) {
            super(message);
            this.retryable = retryable;
        }
    }

    public DeliverResult deliver(String to, List<String> cc, String subject, String html, String text) {
        if (resendApiKey == null || resendApiKey.isBlank()) {
            return DeliverResult.failure("RESEND_API_KEY is not configured on this service yet.");
        }
        try {
            breaker.run(() -> Retry.withRetry(
                    () -> {
                        deliverOnce(to, cc, subject, html, text);
                        return null;
                    },
                    2,
                    500,
                    e -> (e instanceof ResendResponseException re && re.retryable) || !(e instanceof ResendResponseException)
            ));
            return DeliverResult.success();
        } catch (CircuitOpenException e) {
            return DeliverResult.failure(e.getMessage());
        } catch (ResendResponseException e) {
            return DeliverResult.failure(e.getMessage());
        } catch (RestClientException e) {
            // Timeouts (ResourceAccessException) and connection failures land here, after the
            // retries above have already been exhausted for them.
            return DeliverResult.failure(e.getMessage() != null ? e.getMessage() : "Unknown error calling Resend.");
        }
    }

    private void deliverOnce(String to, List<String> cc, String subject, String html, String text) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("from", resendFromEmail);
        body.put("to", to);
        if (cc != null && !cc.isEmpty()) body.put("cc", cc);
        body.put("subject", subject);
        body.put("html", html);
        body.put("text", text);

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(resendApiKey);
        headers.setContentType(MediaType.APPLICATION_JSON);

        try {
            restTemplate.postForEntity("https://api.resend.com/emails", new HttpEntity<>(body, headers), String.class);
        } catch (HttpStatusCodeException e) {
            HttpStatusCode status = e.getStatusCode();
            String detail = e.getResponseBodyAsString();
            String message = "Resend responded " + status.value() + ": " + (detail != null && !detail.isBlank() ? detail : e.getStatusText());
            // Only a server-side error is worth retrying — a 4xx (bad request, invalid key,
            // rate-limited) will look identical on a second attempt with the same payload.
            throw new ResendResponseException(message, status.is5xxServerError());
        }
    }
}
