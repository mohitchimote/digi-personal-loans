package com.digibank.rule.mandates;

import com.digibank.rule.mandates.dto.MandateRulesDto;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Internal-only contract (no api-gateway route) — application-service's DecisioningController
 * proxies its public /api/applications/mandate-rules endpoint to this one, so ADMIN-only write
 * gating (enforced there, not here — see application-service's SecurityConfig) is unchanged. */
@RestController
@RequestMapping("/internal/rules/mandates")
public class MandateController {

    private final MandateRuleService service;

    public MandateController(MandateRuleService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<MandateRulesDto> getRules() {
        return ResponseEntity.ok(service.getRules());
    }

    @PutMapping
    public ResponseEntity<MandateRulesDto> updateRules(@RequestBody MandateRulesDto update) {
        return ResponseEntity.ok(service.updateRules(update));
    }
}
