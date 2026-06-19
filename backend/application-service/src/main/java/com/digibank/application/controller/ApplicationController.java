package com.digibank.application.controller;

import com.digibank.application.dto.ApplicationSectionRequest;
import com.digibank.application.dto.StartApplicationRequest;
import com.digibank.application.dto.StartPreApprovedRequest;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.model.UnderwritingNote;
import com.digibank.application.service.ApplicationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/applications")
public class ApplicationController {

    private final ApplicationService applicationService;

    public ApplicationController(ApplicationService applicationService) {
        this.applicationService = applicationService;
    }

    @PostMapping("/start")
    public ResponseEntity<LoanApplication> startApplication(@Valid @RequestBody StartApplicationRequest request) {
        return ResponseEntity.ok(
                applicationService.createOrResumeApplication(request.getCustomerId(), request.getCustomerEmail()));
    }

    @PostMapping("/start-pre-approved")
    public ResponseEntity<LoanApplication> startPreApprovedApplication(@Valid @RequestBody StartPreApprovedRequest request) {
        return ResponseEntity.ok(applicationService.createPreApprovedApplication(
                request.getCustomerId(), request.getCustomerEmail(), request.getNationalId()));
    }

    @PutMapping("/{appRef}/section")
    public ResponseEntity<LoanApplication> saveSection(
            @PathVariable String appRef,
            @Valid @RequestBody ApplicationSectionRequest request) {
        return ResponseEntity.ok(
                applicationService.saveSection(appRef, request.getSection(), request.getData()));
    }

    @PutMapping("/{appRef}/section-by-underwriter")
    public ResponseEntity<LoanApplication> saveSectionByUnderwriter(
            @PathVariable String appRef,
            @Valid @RequestBody ApplicationSectionRequest request,
            @RequestParam String editedBy) {
        return ResponseEntity.ok(
                applicationService.saveSectionByUnderwriter(appRef, request.getSection(), request.getData(), editedBy));
    }

    @GetMapping("/{appRef}")
    public ResponseEntity<LoanApplication> getApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(applicationService.getApplication(appRef));
    }

    @PutMapping("/{appRef}/affordability-result")
    public ResponseEntity<LoanApplication> saveAffordabilityResult(
            @PathVariable String appRef, @RequestBody Map<String, Object> result) {
        return ResponseEntity.ok(applicationService.saveAffordabilityResult(appRef, result));
    }

    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<LoanApplication>> getCustomerApplications(@PathVariable Long customerId) {
        return ResponseEntity.ok(applicationService.getApplicationsByCustomer(customerId));
    }

    @GetMapping("/customer/{customerId}/current")
    public ResponseEntity<LoanApplication> getCurrentApplication(@PathVariable Long customerId) {
        return ResponseEntity.ok(applicationService.getCurrentApplication(customerId));
    }

    @PostMapping("/{appRef}/withdraw")
    public ResponseEntity<LoanApplication> withdrawApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(applicationService.withdrawApplication(appRef));
    }

    @PostMapping("/{appRef}/cancel")
    public ResponseEntity<LoanApplication> cancelApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(applicationService.cancelApplication(appRef));
    }

    @GetMapping("/pipeline")
    public ResponseEntity<List<LoanApplication>> getPipeline() {
        return ResponseEntity.ok(applicationService.getPipeline());
    }

    @PostMapping("/{appRef}/decline")
    public ResponseEntity<LoanApplication> declineApplication(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(applicationService.declineApplication(appRef, body.get("reason"), body.get("reviewedBy")));
    }

    @PostMapping("/{appRef}/send-back")
    public ResponseEntity<LoanApplication> sendBackApplication(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(applicationService.sendBackApplication(appRef, body.get("reason"), body.get("reviewedBy")));
    }

    @PostMapping("/{appRef}/approve-by-underwriter")
    public ResponseEntity<LoanApplication> approveByUnderwriter(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        String approvedAmountStr = body.get("approvedAmount");
        java.math.BigDecimal approvedAmount = (approvedAmountStr != null && !approvedAmountStr.isBlank())
                ? new java.math.BigDecimal(approvedAmountStr) : null;
        return ResponseEntity.ok(applicationService.approveApplicationByUnderwriter(appRef, body.get("reviewedBy"), approvedAmount));
    }

    @PostMapping("/{appRef}/notes")
    public ResponseEntity<UnderwritingNote> addNote(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(applicationService.addNote(
                appRef, body.get("section"), body.get("note"), body.getOrDefault("noteType", "NOTE"), body.get("createdBy")));
    }

    @GetMapping("/{appRef}/notes")
    public ResponseEntity<List<UnderwritingNote>> getNotes(@PathVariable String appRef) {
        return ResponseEntity.ok(applicationService.getNotes(appRef));
    }

    @PostMapping("/{appRef}/submit")
    public ResponseEntity<LoanApplication> submitApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(applicationService.submitApplication(appRef));
    }

    @PostMapping("/{appRef}/select-product")
    public ResponseEntity<LoanApplication> selectProduct(
            @PathVariable String appRef,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(applicationService.selectProduct(appRef, body));
    }

    @PostMapping("/{appRef}/approve")
    public ResponseEntity<LoanApplication> approveApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(applicationService.approveApplication(appRef));
    }

    @PostMapping("/{appRef}/refer-to-senior")
    public ResponseEntity<LoanApplication> referToSenior(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(applicationService.referToSeniorUnderwriter(appRef, body.get("reason"), body.get("reviewedBy")));
    }

    @PostMapping("/{appRef}/disbursement/authorise")
    public ResponseEntity<LoanApplication> authoriseFundRelease(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(applicationService.authoriseFundRelease(appRef, body.get("reviewedBy")));
    }

    @PostMapping("/{appRef}/disbursement/second-check")
    public ResponseEntity<LoanApplication> submitForSecondCheck(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(applicationService.submitForSecondCheck(appRef, body.get("reviewedBy")));
    }
}
