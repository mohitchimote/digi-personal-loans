package com.digibank.affordability.controller;

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

    public AffordabilityController(AffordabilityService affordabilityService) {
        this.affordabilityService = affordabilityService;
    }

    @PostMapping("/check")
    public ResponseEntity<AffordabilityResult> checkAffordability(
            @Valid @RequestBody AffordabilityRequest request) {
        return ResponseEntity.ok(affordabilityService.assess(request));
    }
}
