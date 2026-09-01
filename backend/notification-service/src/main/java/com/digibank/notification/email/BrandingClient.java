package com.digibank.notification.email;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/** Calls auth-service's public GET /api/branding — see BrandingController. Notification-service
 * has no branding table of its own; the Worker reads brandingSettings directly (single process),
 * this is the HTTP-hop equivalent. */
@Component
public class BrandingClient {

    private final RestTemplate restTemplate;

    @Value("${app.auth-service.url}")
    private String authServiceUrl;

    public BrandingClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public BrandingInfo getBranding() {
        try {
            Map<?, ?> body = restTemplate.getForObject(authServiceUrl + "/api/branding", Map.class);
            if (body == null) return new BrandingInfo("#003366", null);
            Object primaryColor = body.get("primaryColor");
            Object logoUrl = body.get("logoUrl");
            return new BrandingInfo(
                    primaryColor != null ? primaryColor.toString() : "#003366",
                    logoUrl != null ? logoUrl.toString() : null);
        } catch (Exception ignored) {
            return new BrandingInfo("#003366", null);
        }
    }
}
