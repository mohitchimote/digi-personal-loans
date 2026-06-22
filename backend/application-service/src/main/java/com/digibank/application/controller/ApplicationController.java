package com.digibank.application.controller;

import com.digibank.application.config.MandateRules;
import com.digibank.application.dto.ApplicationSectionRequest;
import com.digibank.application.dto.DataVerificationResolutionRequest;
import com.digibank.application.dto.DataVerificationSummary;
import com.digibank.application.dto.StartApplicationRequest;
import com.digibank.application.dto.StartPreApprovedRequest;
import com.digibank.application.dto.BusinessFinancialsAnalysis;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.model.UnderwritingNote;
import com.digibank.application.service.ApplicationService;
import com.digibank.application.service.BusinessFinancialsAnalysisService;
import com.digibank.application.service.DataVerificationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/applications")
public class ApplicationController {

    private final ApplicationService applicationService;
    private final DataVerificationService dataVerificationService;
    private final BusinessFinancialsAnalysisService businessFinancialsAnalysisService;
    private final MandateRules mandateRules;

    public ApplicationController(ApplicationService applicationService, DataVerificationService dataVerificationService,
                                  BusinessFinancialsAnalysisService businessFinancialsAnalysisService, MandateRules mandateRules) {
        this.applicationService = applicationService;
        this.dataVerificationService = dataVerificationService;
        this.businessFinancialsAnalysisService = businessFinancialsAnalysisService;
        this.mandateRules = mandateRules;
    }

    @PostMapping("/start")
    public ResponseEntity<LoanApplication> startApplication(@Valid @RequestBody StartApplicationRequest request) {
        return ResponseEntity.ok(
                applicationService.createOrResumeApplication(request.getCustomerId(), request.getCustomerEmail()));
    }

    @PostMapping("/start-business")
    public ResponseEntity<LoanApplication> startBusinessApplication(@Valid @RequestBody StartApplicationRequest request) {
        return ResponseEntity.ok(
                applicationService.createOrResumeBusinessApplication(request.getCustomerId(), request.getCustomerEmail()));
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

    @GetMapping("/banker-queue")
    public ResponseEntity<List<LoanApplication>> getBankerQueue() {
        return ResponseEntity.ok(applicationService.getBankerQueue());
    }

    @PostMapping("/{appRef}/decline")
    public ResponseEntity<LoanApplication> declineApplication(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(applicationService.declineApplication(appRef, body.get("reason"), body.get("reviewedBy")));
    }

    @PostMapping("/{appRef}/send-back")
    public ResponseEntity<LoanApplication> sendBackApplication(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        boolean requireGuarantor = "true".equalsIgnoreCase(body.get("requireGuarantor"));
        return ResponseEntity.ok(applicationService.sendBackApplication(appRef, body.get("reason"), body.get("reviewedBy"), requireGuarantor));
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

    @GetMapping("/{appRef}/data-verification")
    public ResponseEntity<DataVerificationSummary> getDataVerification(@PathVariable String appRef) {
        return ResponseEntity.ok(dataVerificationService.getOrGenerate(appRef));
    }

    @PostMapping("/{appRef}/data-verification/resolve")
    public ResponseEntity<DataVerificationSummary> resolveDataVerificationRule(
            @PathVariable String appRef, @Valid @RequestBody DataVerificationResolutionRequest request) {
        return ResponseEntity.ok(dataVerificationService.resolveRule(appRef, request));
    }

    @GetMapping("/{appRef}/business-financials-analysis")
    public ResponseEntity<BusinessFinancialsAnalysis> getBusinessFinancialsAnalysis(@PathVariable String appRef) {
        return ResponseEntity.ok(businessFinancialsAnalysisService.getOrGenerate(appRef));
    }

    @GetMapping("/mandate-rules")
    public ResponseEntity<MandateRules> getMandateRules() {
        return ResponseEntity.ok(mandateRules);
    }

    @PutMapping("/mandate-rules")
    public ResponseEntity<MandateRules> updateMandateRules(@RequestBody MandateRules update) {
        mandateRules.setUnderwriterLimit(update.getUnderwriterLimit());
        mandateRules.setSeniorUnderwriterLimit(update.getSeniorUnderwriterLimit());
        mandateRules.setHeadOfLendingLimit(update.getHeadOfLendingLimit());
        mandateRules.setCooLimit(update.getCooLimit());
        mandateRules.setCeoLimit(update.getCeoLimit());
        return ResponseEntity.ok(mandateRules);
    }
}
