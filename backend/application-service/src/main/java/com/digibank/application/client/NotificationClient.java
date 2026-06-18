package com.digibank.application.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Component
public class NotificationClient {

    private final RestTemplate restTemplate;

    @Value("${app.notification-service.url}")
    private String notificationServiceUrl;

    public NotificationClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public void send(Long customerId, String title, String message, String type, String applicationRef) {
        try {
            Map<String, Object> body = Map.of(
                    "customerId", customerId,
                    "title", title,
                    "message", message,
                    "type", type,
                    "applicationRef", applicationRef
            );
            restTemplate.postForObject(notificationServiceUrl + "/api/notifications/create", body, Object.class);
        } catch (Exception ignored) {
            // Notification delivery failure should never block an underwriting decision.
        }
    }
}
