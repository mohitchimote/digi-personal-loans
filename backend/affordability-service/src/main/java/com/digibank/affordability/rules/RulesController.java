package com.digibank.affordability.rules;

import com.digibank.affordability.client.RuleServiceClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Rules-administration context (ARCHITECTURE.md §10) — split out of the old AffordabilityController,
 * which mixed this with the assessment context (see assessment.AssessmentController). Endpoint
 * paths are unchanged (/api/affordability/rules); a thin proxy to rule-service since G4, so the
 * client-visible contract and role gating (PUT is ADMIN-only, enforced in SecurityConfig) are
 * unchanged even though the data no longer lives in this process.
 */
@RestController
@RequestMapping("/api/affordability")
public class RulesController {

    private final RuleServiceClient ruleServiceClient;

    public RulesController(RuleServiceClient ruleServiceClient) {
        this.ruleServiceClient = ruleServiceClient;
    }

    @GetMapping("/rules")
    public ResponseEntity<AffordabilityRules> getRules() {
        return ResponseEntity.ok(ruleServiceClient.getAffordabilityRules());
    }

    @PutMapping("/rules")
    public ResponseEntity<AffordabilityRules> updateRules(@RequestBody AffordabilityRules update) {
        return ResponseEntity.ok(ruleServiceClient.updateAffordabilityRules(update));
    }
}
