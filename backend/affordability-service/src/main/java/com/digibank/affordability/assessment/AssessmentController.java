package com.digibank.affordability.assessment;

import com.digibank.affordability.assessment.dto.AffordabilityRequest;
import com.digibank.affordability.assessment.dto.AffordabilityResult;
import com.digibank.affordability.assessment.dto.BusinessAffordabilityRequest;
import com.digibank.affordability.assessment.dto.BusinessAffordabilityResult;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Assessment context (ARCHITECTURE.md §10) — split out of the old AffordabilityController, which
 * mixed this with the rules-administration context (see rules.RulesController). Endpoint paths are
 * unchanged (/api/affordability/check, /check-business), so this is a pure internal reorganization
 * with no client-visible or behavioral change.
 */
@RestController
@RequestMapping("/api/affordability")
public class AssessmentController {

    private final AffordabilityService affordabilityService;
    private final BusinessAffordabilityService businessAffordabilityService;

    public AssessmentController(AffordabilityService affordabilityService, BusinessAffordabilityService businessAffordabilityService) {
        this.affordabilityService = affordabilityService;
        this.businessAffordabilityService = businessAffordabilityService;
    }

    @PostMapping("/check")
    public ResponseEntity<AffordabilityResult> checkAffordability(
            @Valid @RequestBody AffordabilityRequest request) {
        return ResponseEntity.ok(affordabilityService.assess(request));
    }

    @PostMapping("/check-business")
    public ResponseEntity<BusinessAffordabilityResult> checkBusinessAffordability(
            @Valid @RequestBody BusinessAffordabilityRequest request) {
        return ResponseEntity.ok(businessAffordabilityService.assess(request));
    }
}
