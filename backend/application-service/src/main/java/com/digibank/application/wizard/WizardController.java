package com.digibank.application.wizard;

import com.digibank.application.model.LoanApplication;
import com.digibank.application.security.CurrentUser;
import com.digibank.application.wizard.dto.ApplicationSectionRequest;
import com.digibank.application.wizard.dto.StartApplicationRequest;
import com.digibank.application.wizard.dto.StartPreApprovedRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Wizard/section-engine context (ARCHITECTURE.md §10) — split out of the old
 * ApplicationController. Endpoint paths unchanged.
 */
@RestController
@RequestMapping("/api/applications")
public class WizardController {

    private final WizardService wizardService;

    public WizardController(WizardService wizardService) {
        this.wizardService = wizardService;
    }

    @PostMapping("/start")
    public ResponseEntity<LoanApplication> startApplication(@Valid @RequestBody StartApplicationRequest request) {
        return ResponseEntity.ok(
                wizardService.createOrResumeApplication(request.getCustomerId(), request.getCustomerEmail()));
    }

    @PostMapping("/start-business")
    public ResponseEntity<LoanApplication> startBusinessApplication(@Valid @RequestBody StartApplicationRequest request) {
        return ResponseEntity.ok(
                wizardService.createOrResumeBusinessApplication(request.getCustomerId(), request.getCustomerEmail()));
    }

    @PostMapping("/start-pre-approved")
    public ResponseEntity<LoanApplication> startPreApprovedApplication(@Valid @RequestBody StartPreApprovedRequest request) {
        return ResponseEntity.ok(wizardService.createPreApprovedApplication(
                request.getCustomerId(), request.getCustomerEmail(), request.getNationalId()));
    }

    @PutMapping("/{appRef}/section")
    public ResponseEntity<LoanApplication> saveSection(
            @PathVariable String appRef,
            @Valid @RequestBody ApplicationSectionRequest request) {
        return ResponseEntity.ok(
                wizardService.saveSection(appRef, request.getSection(), request.getData()));
    }

    @PutMapping("/{appRef}/section-by-underwriter")
    public ResponseEntity<LoanApplication> saveSectionByUnderwriter(
            @PathVariable String appRef,
            @Valid @RequestBody ApplicationSectionRequest request) {
        return ResponseEntity.ok(wizardService.saveSectionByUnderwriter(
                appRef, request.getSection(), request.getData(), CurrentUser.get().displayName()));
    }

    @GetMapping("/{appRef}")
    public ResponseEntity<LoanApplication> getApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(wizardService.getApplication(appRef));
    }

    @PutMapping("/{appRef}/affordability-result")
    public ResponseEntity<LoanApplication> saveAffordabilityResult(
            @PathVariable String appRef, @RequestBody Map<String, Object> result) {
        return ResponseEntity.ok(wizardService.saveAffordabilityResult(appRef, result));
    }

    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<LoanApplication>> getCustomerApplications(@PathVariable Long customerId) {
        return ResponseEntity.ok(wizardService.getApplicationsByCustomer(customerId));
    }

    @GetMapping("/customer/{customerId}/current")
    public ResponseEntity<LoanApplication> getCurrentApplication(@PathVariable Long customerId) {
        return ResponseEntity.ok(wizardService.getCurrentApplication(customerId));
    }

    @PostMapping("/{appRef}/withdraw")
    public ResponseEntity<LoanApplication> withdrawApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(wizardService.withdrawApplication(appRef));
    }

    @PostMapping("/{appRef}/cancel")
    public ResponseEntity<LoanApplication> cancelApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(wizardService.cancelApplication(appRef));
    }

    @PostMapping("/{appRef}/submit")
    public ResponseEntity<LoanApplication> submitApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(wizardService.submitApplication(appRef));
    }

    @PostMapping("/{appRef}/select-product")
    public ResponseEntity<LoanApplication> selectProduct(
            @PathVariable String appRef,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(wizardService.selectProduct(appRef, body));
    }
}
