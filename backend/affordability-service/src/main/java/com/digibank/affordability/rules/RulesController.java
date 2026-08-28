package com.digibank.affordability.rules;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Rules-administration context (ARCHITECTURE.md §10) — split out of the old AffordabilityController,
 * which mixed this with the assessment context (see assessment.AssessmentController). Endpoint
 * paths are unchanged (/api/affordability/rules), so this is a pure internal reorganization with no
 * client-visible or behavioral change.
 */
@RestController
@RequestMapping("/api/affordability")
public class RulesController {

    private final AffordabilityRules rules;

    public RulesController(AffordabilityRules rules) {
        this.rules = rules;
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
