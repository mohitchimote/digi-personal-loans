package com.digibank.application.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Component
public class ProductClient {

    private final RestTemplate restTemplate;

    @Value("${app.product-service.url}")
    private String productServiceUrl;

    public ProductClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> getPreApprovedOffer(String nationalId) {
        try {
            return restTemplate.getForObject(
                    productServiceUrl + "/api/products/pre-approved/" + nationalId, Map.class);
        } catch (Exception ignored) {
            return null;
        }
    }

    public void consumePreApprovedOffer(String nationalId) {
        try {
            restTemplate.postForObject(
                    productServiceUrl + "/api/products/pre-approved/" + nationalId + "/consume", null, Map.class);
        } catch (Exception ignored) {
            // best-effort — failing to mark the offer consumed must never block the application creation
        }
    }
}
