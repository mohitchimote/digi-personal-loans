package com.digibank.application.wizard;

import com.digibank.application.model.LoanApplication;
import com.digibank.application.security.AuthenticatedUser;
import com.digibank.application.security.CaseAccess;
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
 *
 * Who may do what, as in the Worker: every route that moves or changes a case on the customer's behalf
 * (section save, submit, withdraw, cancel, select-product, affordability result) is for the owning
 * customer or staff holding case.actAsCustomer (403 otherwise); reads are for the owner, or staff within
 * their org scope (404 otherwise, so existence is not confirmed).
 */
@RestController
@RequestMapping("/api/applications")
public class WizardController {

    private final WizardService wizardService;
    private final CaseAccess caseAccess;

    public WizardController(WizardService wizardService, CaseAccess caseAccess) {
        this.wizardService = wizardService;
        this.caseAccess = caseAccess;
    }

    /** A case opened by staff (banker-assisted origination) belongs to that person's org unit; a customer's own has none. */
    private static Long originOrgUnitId() {
        AuthenticatedUser user = CurrentUser.get();
        return user.isStaff() ? user.orgUnitId() : null;
    }

    @PostMapping("/start")
    public ResponseEntity<LoanApplication> startApplication(@Valid @RequestBody StartApplicationRequest request) {
        CaseAccess.assertOwnsCustomerId(request.getCustomerId());
        return ResponseEntity.ok(wizardService.createOrResumeApplication(
                request.getCustomerId(), request.getCustomerEmail(), originOrgUnitId()));
    }

    @PostMapping("/start-business")
    public ResponseEntity<LoanApplication> startBusinessApplication(@Valid @RequestBody StartApplicationRequest request) {
        CaseAccess.assertOwnsCustomerId(request.getCustomerId());
        return ResponseEntity.ok(wizardService.createOrResumeBusinessApplication(
                request.getCustomerId(), request.getCustomerEmail(), originOrgUnitId()));
    }

    @PostMapping("/start-pre-approved")
    public ResponseEntity<LoanApplication> startPreApprovedApplication(@Valid @RequestBody StartPreApprovedRequest request) {
        CaseAccess.assertOwnsCustomerId(request.getCustomerId());
        return ResponseEntity.ok(wizardService.createPreApprovedApplication(
                request.getCustomerId(), request.getCustomerEmail(), request.getNationalId()));
    }

    @PutMapping("/{appRef}/section")
    public ResponseEntity<LoanApplication> saveSection(
            @PathVariable String appRef,
            @Valid @RequestBody ApplicationSectionRequest request) {
        caseAccess.actingAsCustomer(appRef);
        return ResponseEntity.ok(
                wizardService.saveSection(appRef, CurrentUser.get(), request.getSection(), request.getData()));
    }

    @PutMapping("/{appRef}/section-by-underwriter")
    public ResponseEntity<LoanApplication> saveSectionByUnderwriter(
            @PathVariable String appRef,
            @Valid @RequestBody ApplicationSectionRequest request) {
        caseAccess.visible(appRef);
        return ResponseEntity.ok(wizardService.saveSectionByUnderwriter(
                appRef, CurrentUser.get(), request.getSection(), request.getData()));
    }

    @GetMapping("/{appRef}")
    public ResponseEntity<Map<String, Object>> getApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(wizardService.view(caseAccess.visible(appRef)));
    }

    @PutMapping("/{appRef}/affordability-result")
    public ResponseEntity<LoanApplication> saveAffordabilityResult(
            @PathVariable String appRef, @RequestBody Map<String, Object> result) {
        caseAccess.actingAsCustomer(appRef);
        return ResponseEntity.ok(wizardService.saveAffordabilityResult(appRef, result));
    }

    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<LoanApplication>> getCustomerApplications(@PathVariable Long customerId) {
        CaseAccess.assertOwnsCustomerId(customerId);
        return ResponseEntity.ok(wizardService.getApplicationsByCustomer(customerId));
    }

    @GetMapping("/customer/{customerId}/current")
    public ResponseEntity<Map<String, Object>> getCurrentApplication(@PathVariable Long customerId) {
        CaseAccess.assertOwnsCustomerId(customerId);
        return ResponseEntity.ok(wizardService.view(wizardService.getCurrentApplication(customerId)));
    }

    @PostMapping("/{appRef}/withdraw")
    public ResponseEntity<LoanApplication> withdrawApplication(@PathVariable String appRef) {
        caseAccess.actingAsCustomer(appRef);
        return ResponseEntity.ok(wizardService.withdrawApplication(appRef, CurrentUser.get()));
    }

    @PostMapping("/{appRef}/cancel")
    public ResponseEntity<LoanApplication> cancelApplication(@PathVariable String appRef) {
        caseAccess.actingAsCustomer(appRef);
        return ResponseEntity.ok(wizardService.cancelApplication(appRef, CurrentUser.get()));
    }

    @PostMapping("/{appRef}/submit")
    public ResponseEntity<LoanApplication> submitApplication(@PathVariable String appRef) {
        caseAccess.actingAsCustomer(appRef);
        return ResponseEntity.ok(wizardService.submitApplication(appRef, CurrentUser.get()));
    }

    @PostMapping("/{appRef}/select-product")
    public ResponseEntity<LoanApplication> selectProduct(
            @PathVariable String appRef,
            @RequestBody Map<String, Object> body) {
        caseAccess.actingAsCustomer(appRef);
        return ResponseEntity.ok(wizardService.selectProduct(appRef, CurrentUser.get(), body));
    }
}
