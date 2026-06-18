package com.digibank.application.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Component
public class DocumentClient {

    private final RestTemplate restTemplate;

    @Value("${app.document-service.url}")
    private String documentServiceUrl;

    public DocumentClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public void generateFinalApprovalLetter(String applicationRef, Long customerId, String customerName,
                                             Double loanAmount, String productName, Double interestRate,
                                             Integer termMonths, Double monthlyRepayment) {
        try {
            Map<String, Object> body = Map.of(
                    "applicationRef", applicationRef,
                    "customerId", customerId,
                    "documentType", "FINAL_APPROVAL_LETTER",
                    "customerName", customerName,
                    "loanAmount", loanAmount,
                    "productName", productName,
                    "interestRate", interestRate,
                    "termMonths", termMonths,
                    "monthlyRepayment", monthlyRepayment
            );
            restTemplate.postForObject(documentServiceUrl + "/api/documents/generate", body, Object.class);
        } catch (Exception ignored) {
            // Document generation failure should never block an underwriting decision.
        }
    }
}
