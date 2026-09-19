package com.digibank.auth.otpdelivery;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Only implementation of OtpDeliveryPort today — calls integration-service, which simulates the
 * actual send (ARCHITECTURE_REVIEW_GAPS.md, G5). Deliberately fire-and-forget: a hung/unreachable
 * integration-service must never block registration or login, since demoOtp is returned to the
 * caller independently of whether this "delivery" succeeds — same reasoning as
 * DecisioningService.generateFinalApprovalLetter's catch-and-ignore.
 */
@Component
public class IntegrationServiceOtpDeliveryAdapter implements OtpDeliveryPort {

    private static final Logger log = LoggerFactory.getLogger(IntegrationServiceOtpDeliveryAdapter.class);

    private final RestTemplate restTemplate;

    @Value("${app.integration-service.url}")
    private String integrationServiceUrl;

    public IntegrationServiceOtpDeliveryAdapter(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public void deliver(String destination, String channel, String code) {
        try {
            Map<String, String> request = new LinkedHashMap<>();
            request.put("destination", destination);
            request.put("channel", channel);
            request.put("code", code);
            restTemplate.postForObject(integrationServiceUrl + "/internal/integration/otp/deliver", request, Map.class);
        } catch (Exception e) {
            log.warn("Simulated OTP delivery via integration-service failed (non-fatal, demoOtp is unaffected): {}", e.getMessage());
        }
    }
}
