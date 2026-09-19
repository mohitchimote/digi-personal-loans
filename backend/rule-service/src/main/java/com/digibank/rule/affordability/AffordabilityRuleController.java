package com.digibank.rule.affordability;

import com.digibank.rule.affordability.dto.AffordabilityRulesDto;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Internal-only contract (no api-gateway route) — affordability-service's RulesController proxies
 * its public /api/affordability/rules endpoint to this one, so role gating (enforced there, not
 * here — ADMIN-only on writes) is unchanged. */
@RestController
@RequestMapping("/internal/rules/affordability")
public class AffordabilityRuleController {

    private final AffordabilityRuleService service;

    public AffordabilityRuleController(AffordabilityRuleService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<AffordabilityRulesDto> getRules() {
        return ResponseEntity.ok(service.getRules());
    }

    @PutMapping
    public ResponseEntity<AffordabilityRulesDto> updateRules(@RequestBody AffordabilityRulesDto update) {
        return ResponseEntity.ok(service.updateRules(update));
    }
}
