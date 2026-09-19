package com.digibank.application.businessfinancials;

import com.digibank.application.businessfinancials.dto.BusinessFinancialsAnalysis;
import com.digibank.application.businessfinancials.dto.BusinessFinancialsGenerateRequest;
import com.digibank.application.model.LoanApplication;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/**
 * Real implementation of BusinessFinancialsPort since G5 (ARCHITECTURE_REVIEW_GAPS.md) — delegates
 * the actual generation to integration-service instead of running it locally
 * (SimulatedBusinessFinancialsAdapter's logic moved there unchanged). BusinessFinancialsAnalysisService
 * (the orchestrator that persists results) required no code change at all — exactly the payoff this
 * port was designed for (PRODUCTION_READINESS.md §7).
 */
@Component
public class IntegrationServiceBusinessFinancialsAdapter implements BusinessFinancialsPort {

    private final RestTemplate restTemplate;

    @Value("${app.integration-service.url}")
    private String integrationServiceUrl;

    public IntegrationServiceBusinessFinancialsAdapter(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public BusinessFinancialsAnalysis generate(LoanApplication app) {
        BusinessFinancialsGenerateRequest request = new BusinessFinancialsGenerateRequest();
        request.setApplicationRef(app.getApplicationRef());
        request.setBusinessFinancialsJson(app.getBusinessFinancialsJson());
        request.setBusinessCreditDeclarationsJson(app.getBusinessCreditDeclarationsJson());
        request.setAffordabilityResultJson(app.getAffordabilityResultJson());

        return restTemplate.postForObject(
                integrationServiceUrl + "/internal/integration/business-financials/generate",
                request, BusinessFinancialsAnalysis.class);
    }
}
