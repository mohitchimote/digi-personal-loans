package com.digibank.application.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * Calls notification-service's internal /api/notifications/email/send (EmailDeliveryController) —
 * this service computes the variable map itself (it owns the LoanApplication data), notification-
 * service just renders and delivers, mirroring NotificationClient exactly.
 *
 * @Async (see AsyncConfig) so this runs on a background thread instead of inside the caller's
 * @Transactional decisioning method — the customer/staff response returns as soon as the DB write
 * is done, and this network call (application-service -> notification-service -> Resend) happens
 * afterward. Port of worker/src/routes/applications.ts's ExecutionContext.waitUntil usage.
 */
@Component
public class EmailClient {

    private final RestTemplate restTemplate;

    @Value("${app.notification-service.url}")
    private String notificationServiceUrl;

    public EmailClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Async("emailTaskExecutor")
    public void send(String eventKey, String customerEmail, Map<String, String> variables) {
        try {
            Map<String, Object> body = Map.of(
                    "eventKey", eventKey,
                    "customerEmail", customerEmail,
                    "variables", variables
            );
            restTemplate.postForObject(notificationServiceUrl + "/api/notifications/email/send", body, Object.class);
        } catch (Exception ignored) {
            // Email delivery failure should never block an underwriting decision — same convention
            // as NotificationClient.
        }
    }
}
