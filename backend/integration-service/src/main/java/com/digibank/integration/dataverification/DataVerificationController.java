package com.digibank.integration.dataverification;

import com.digibank.integration.dataverification.dto.DataVerificationGenerateRequest;
import com.digibank.integration.dataverification.dto.DataVerificationSummary;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Internal-only contract (no api-gateway route) — application-service's
 * dataverification.IntegrationServiceDataVerificationAdapter (implements the unchanged
 * DataVerificationPort) calls this instead of running the simulation locally. */
@RestController
@RequestMapping("/internal/integration/data-verification")
public class DataVerificationController {

    private final DataVerificationGenerator generator;

    public DataVerificationController(DataVerificationGenerator generator) {
        this.generator = generator;
    }

    @PostMapping("/generate")
    public ResponseEntity<DataVerificationSummary> generate(@RequestBody DataVerificationGenerateRequest request) {
        return ResponseEntity.ok(generator.generate(request));
    }
}
