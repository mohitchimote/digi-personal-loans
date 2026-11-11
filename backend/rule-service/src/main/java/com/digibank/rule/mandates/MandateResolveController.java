package com.digibank.rule.mandates;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-to-service: the approval limit for a role on a case. No gateway route (as every /internal endpoint
 * here). Answers {limit, orgUnitId, applicationType}; limit is null when no mandate row applies, which means no
 * approval authority (the Worker treats it as 0). orgUnitId and applicationType say which row matched (both null
 * when the role default did, or when none did).
 */
@RestController
@RequestMapping("/internal/rules/mandates")
public class MandateResolveController {

    private final MandateResolveService service;

    public MandateResolveController(MandateResolveService service) {
        this.service = service;
    }

    @GetMapping("/resolve")
    public MandateResolver.Resolved resolve(@RequestParam String role,
                                            @RequestParam(required = false) Long orgUnitId,
                                            @RequestParam(required = false) String applicationType) {
        return service.resolve(role, orgUnitId, applicationType);
    }
}
