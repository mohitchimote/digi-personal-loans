package com.digibank.integration.businessfinancials;

import com.digibank.integration.businessfinancials.dto.BusinessFinancialsAnalysis;
import com.digibank.integration.businessfinancials.dto.BusinessFinancialsGenerateRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Internal-only contract (no api-gateway route) — application-service's
 * businessfinancials.IntegrationServiceBusinessFinancialsAdapter (implements the unchanged
 * BusinessFinancialsPort) calls this instead of running the simulation locally. */
@RestController
@RequestMapping("/internal/integration/business-financials")
public class BusinessFinancialsController {

    private final BusinessFinancialsGenerator generator;

    public BusinessFinancialsController(BusinessFinancialsGenerator generator) {
        this.generator = generator;
    }

    @PostMapping("/generate")
    public ResponseEntity<BusinessFinancialsAnalysis> generate(@RequestBody BusinessFinancialsGenerateRequest request) {
        return ResponseEntity.ok(generator.generate(request));
    }
}
