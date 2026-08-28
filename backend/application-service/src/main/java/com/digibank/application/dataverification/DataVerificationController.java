package com.digibank.application.dataverification;

import com.digibank.application.dataverification.dto.DataVerificationResolutionRequest;
import com.digibank.application.dataverification.dto.DataVerificationSummary;
import com.digibank.application.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Data-verification context (ARCHITECTURE.md §10) — split out of the old ApplicationController.
 * Endpoint paths unchanged.
 */
@RestController
@RequestMapping("/api/applications")
public class DataVerificationController {

    private final DataVerificationService dataVerificationService;

    public DataVerificationController(DataVerificationService dataVerificationService) {
        this.dataVerificationService = dataVerificationService;
    }

    @GetMapping("/{appRef}/data-verification")
    public ResponseEntity<DataVerificationSummary> getDataVerification(@PathVariable String appRef) {
        return ResponseEntity.ok(dataVerificationService.getOrGenerate(appRef));
    }

    @PostMapping("/{appRef}/data-verification/resolve")
    public ResponseEntity<DataVerificationSummary> resolveDataVerificationRule(
            @PathVariable String appRef, @Valid @RequestBody DataVerificationResolutionRequest request) {
        request.setReviewedBy(CurrentUser.get().displayName());
        return ResponseEntity.ok(dataVerificationService.resolveRule(appRef, request));
    }
}
