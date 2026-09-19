package com.digibank.application.dataverification;

import com.digibank.application.dataverification.dto.DataVerificationGenerateRequest;
import com.digibank.application.dataverification.dto.DataVerificationSummary;
import com.digibank.application.model.LoanApplication;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/**
 * Real implementation of DataVerificationPort since G5 (ARCHITECTURE_REVIEW_GAPS.md) — delegates
 * the actual generation to integration-service instead of running it locally
 * (SimulatedDataVerificationAdapter's logic moved there unchanged). DataVerificationService (the
 * orchestrator that persists results and handles staff resolution) required no code change at all
 * — exactly the payoff this port was designed for (PRODUCTION_READINESS.md §7).
 */
@Component
public class IntegrationServiceDataVerificationAdapter implements DataVerificationPort {

    private final RestTemplate restTemplate;

    @Value("${app.integration-service.url}")
    private String integrationServiceUrl;

    public IntegrationServiceDataVerificationAdapter(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public DataVerificationSummary generate(LoanApplication app) {
        DataVerificationGenerateRequest request = new DataVerificationGenerateRequest();
        request.setApplicationRef(app.getApplicationRef());
        request.setPersonalDetailsJson(app.getPersonalDetailsJson());
        request.setIncomeEmploymentJson(app.getIncomeEmploymentJson());
        request.setCreditDeclarationsJson(app.getCreditDeclarationsJson());

        return restTemplate.postForObject(
                integrationServiceUrl + "/internal/integration/data-verification/generate",
                request, DataVerificationSummary.class);
    }
}
