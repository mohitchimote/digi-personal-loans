package com.digibank.application.decisioning;

import com.digibank.application.client.RuleServiceClient;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.security.AuthenticatedUser;
import com.digibank.application.security.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Decisioning & mandates context (ARCHITECTURE.md §10) — split out of the old
 * ApplicationController. Endpoint paths and role gating (SecurityConfig's STAFF_ROLES /
 * ADMIN-only on mandate-rules writes) are unchanged.
 */
@RestController
@RequestMapping("/api/applications")
public class DecisioningController {

    private final DecisioningService decisioningService;
    private final RuleServiceClient ruleServiceClient;

    public DecisioningController(DecisioningService decisioningService, RuleServiceClient ruleServiceClient) {
        this.decisioningService = decisioningService;
        this.ruleServiceClient = ruleServiceClient;
    }

    @GetMapping("/pipeline")
    public ResponseEntity<List<LoanApplication>> getPipeline() {
        return ResponseEntity.ok(decisioningService.getPipeline());
    }

    @GetMapping("/banker-queue")
    public ResponseEntity<List<LoanApplication>> getBankerQueue() {
        return ResponseEntity.ok(decisioningService.getBankerQueue());
    }

    @PostMapping("/{appRef}/decline")
    public ResponseEntity<LoanApplication> declineApplication(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(decisioningService.declineApplication(appRef, body.get("reason"), CurrentUser.get().displayName()));
    }

    @PostMapping("/{appRef}/send-back")
    public ResponseEntity<LoanApplication> sendBackApplication(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        boolean requireGuarantor = "true".equalsIgnoreCase(body.get("requireGuarantor"));
        return ResponseEntity.ok(decisioningService.sendBackApplication(appRef, body.get("reason"), CurrentUser.get().displayName(), requireGuarantor));
    }

    @PostMapping("/{appRef}/approve-by-underwriter")
    public ResponseEntity<LoanApplication> approveByUnderwriter(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        String approvedAmountStr = body.get("approvedAmount");
        BigDecimal approvedAmount = (approvedAmountStr != null && !approvedAmountStr.isBlank())
                ? new BigDecimal(approvedAmountStr) : null;
        AuthenticatedUser caller = CurrentUser.get();
        return ResponseEntity.ok(decisioningService.approveApplicationByUnderwriter(appRef, caller.displayName(), approvedAmount, caller.role()));
    }

    @PostMapping("/{appRef}/approve")
    public ResponseEntity<LoanApplication> approveApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(decisioningService.approveApplication(appRef));
    }

    @PostMapping("/{appRef}/refer-to-senior")
    public ResponseEntity<LoanApplication> referToSenior(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(decisioningService.referToSeniorUnderwriter(appRef, body.get("reason"), CurrentUser.get().displayName()));
    }

    @PostMapping("/{appRef}/disbursement/authorise")
    public ResponseEntity<LoanApplication> authoriseFundRelease(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(decisioningService.authoriseFundRelease(appRef, CurrentUser.get().displayName()));
    }

    @PostMapping("/{appRef}/disbursement/second-check")
    public ResponseEntity<LoanApplication> submitForSecondCheck(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(decisioningService.submitForSecondCheck(appRef, CurrentUser.get().displayName()));
    }

    @GetMapping("/mandate-rules")
    public ResponseEntity<MandateRules> getMandateRules() {
        return ResponseEntity.ok(ruleServiceClient.getMandateRules());
    }

    @PutMapping("/mandate-rules")
    public ResponseEntity<MandateRules> updateMandateRules(@RequestBody MandateRules update) {
        return ResponseEntity.ok(ruleServiceClient.updateMandateRules(update));
    }
}
