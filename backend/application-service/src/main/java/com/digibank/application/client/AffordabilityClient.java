package com.digibank.application.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.Map;

@Component
public class AffordabilityClient {

    private final RestTemplate restTemplate;

    @Value("${app.affordability-service.url}")
    private String affordabilityServiceUrl;

    public AffordabilityClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @SuppressWarnings("unchecked")
    public BigDecimal getAutoApprovalThreshold(boolean jointApplication) {
        try {
            Map<String, Object> rules = restTemplate.getForObject(
                    affordabilityServiceUrl + "/api/affordability/rules", Map.class);
            if (rules == null) return null;
            Object value = jointApplication ? rules.get("autoApprovalThresholdJoint") : rules.get("autoApprovalThresholdSingle");
            return value != null ? new BigDecimal(value.toString()) : null;
        } catch (Exception ignored) {
            return null;
        }
    }
}
