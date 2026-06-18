package com.digibank.affordability.controller;

import com.digibank.affordability.config.AffordabilityRules;
import com.digibank.affordability.dto.AffordabilityRequest;
import com.digibank.affordability.dto.AffordabilityResult;
import com.digibank.affordability.service.AffordabilityService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/affordability")
public class AffordabilityController {

    private final AffordabilityService affordabilityService;
    private final AffordabilityRules rules;

    public AffordabilityController(AffordabilityService affordabilityService, AffordabilityRules rules) {
        this.affordabilityService = affordabilityService;
        this.rules = rules;
    }

    @PostMapping("/check")
    public ResponseEntity<AffordabilityResult> checkAffordability(
            @Valid @RequestBody AffordabilityRequest request) {
        return ResponseEntity.ok(affordabilityService.assess(request));
    }

    @GetMapping("/rules")
    public ResponseEntity<AffordabilityRules> getRules() {
        return ResponseEntity.ok(rules);
    }

    @PutMapping("/rules")
    public ResponseEntity<AffordabilityRules> updateRules(@RequestBody AffordabilityRules update) {
        rules.setMaxDti(update.getMaxDti());
        rules.setMaxHti(update.getMaxHti());
        rules.setMinMonthlyIncome(update.getMinMonthlyIncome());
        rules.setBaseAnnualRate(update.getBaseAnnualRate());
        rules.setRepaymentCapacityFactor(update.getRepaymentCapacityFactor());
        rules.setMinCreditScore(update.getMinCreditScore());
        rules.setAutoApprovalThresholdSingle(update.getAutoApprovalThresholdSingle());
        rules.setAutoApprovalThresholdJoint(update.getAutoApprovalThresholdJoint());
        return ResponseEntity.ok(rules);
    }
}
