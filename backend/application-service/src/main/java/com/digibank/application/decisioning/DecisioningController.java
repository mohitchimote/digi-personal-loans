package com.digibank.application.decisioning;

import com.digibank.application.model.LoanApplication;
import com.digibank.application.security.AuthenticatedUser;
import com.digibank.application.security.CaseAccess;
import com.digibank.application.security.CurrentUser;
import com.digibank.application.workflow.QueueService;
import com.digibank.application.workflow.QueueService.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Decisioning & mandates context (ARCHITECTURE.md §10): the same endpoint paths and entitlement gating
 * (SecurityConfig) as the Worker. Every staff action also needs the case to be visible to the caller's org scope
 * (404 otherwise); beyond that, which statuses an action may start from, the referral lock, the mandate and every
 * effect of the action are the workflow engine's (see DecisioningService). The queues are the definition's:
 * statuses, scope and referral filters come from workflow-service (QueueService).
 */
@RestController
@RequestMapping("/api/applications")
public class DecisioningController {

    private final DecisioningService decisioningService;
    private final CaseAccess caseAccess;
    private final QueueService queues;

    public DecisioningController(DecisioningService decisioningService, CaseAccess caseAccess, QueueService queues) {
        this.decisioningService = decisioningService;
        this.caseAccess = caseAccess;
        this.queues = queues;
    }

    @GetMapping("/pipeline")
    public ResponseEntity<List<Map<String, Object>>> getPipeline(@RequestParam(required = false) String owner) {
        return ResponseEntity.ok(queues.rows(CurrentUser.get(), List.of("pipeline"), Order.SUBMITTED_ASC, owner));
    }

    @GetMapping("/banker-queue")
    public ResponseEntity<List<Map<String, Object>>> getBankerQueue(@RequestParam(required = false) String owner) {
        return ResponseEntity.ok(queues.rows(CurrentUser.get(), List.of("banker-queue"), Order.UPDATED_DESC, owner));
    }

    /** The reason as sent, or null: whether it is acceptable (REASON_REQUIRED) is the engine's call. */
    private static String reasonOf(Map<String, Object> body) {
        Object reason = body.get("reason");
        return reason instanceof String s ? s : null;
    }

    @PostMapping("/{appRef}/decline")
    public ResponseEntity<LoanApplication> declineApplication(@PathVariable String appRef, @RequestBody Map<String, Object> body) {
        caseAccess.visible(appRef);
        return ResponseEntity.ok(decisioningService.declineApplication(appRef, CurrentUser.get(), reasonOf(body)));
    }

    @PostMapping("/{appRef}/send-back")
    public ResponseEntity<LoanApplication> sendBackApplication(@PathVariable String appRef, @RequestBody Map<String, Object> body) {
        caseAccess.visible(appRef);
        boolean requireGuarantor = "true".equalsIgnoreCase(String.valueOf(body.get("requireGuarantor")));
        return ResponseEntity.ok(decisioningService.sendBackApplication(appRef, CurrentUser.get(), reasonOf(body), requireGuarantor));
    }

    @PostMapping("/{appRef}/approve-by-underwriter")
    public ResponseEntity<LoanApplication> approveByUnderwriter(@PathVariable String appRef, @RequestBody Map<String, Object> body) {
        caseAccess.visible(appRef);
        // The client sends a number (or omits it); accept a string too. A missing or non-positive amount is the engine's 400.
        Object raw = body.get("approvedAmount");
        BigDecimal approvedAmount = null;
        if (raw != null && !String.valueOf(raw).isBlank()) {
            try {
                approvedAmount = new BigDecimal(String.valueOf(raw).trim());
            } catch (NumberFormatException e) {
                approvedAmount = null;
            }
        }
        return ResponseEntity.ok(decisioningService.approveApplicationByUnderwriter(appRef, CurrentUser.get(), approvedAmount));
    }

    @PostMapping("/{appRef}/approve")
    public ResponseEntity<LoanApplication> approveApplication(@PathVariable String appRef) {
        caseAccess.visible(appRef);
        return ResponseEntity.ok(decisioningService.approveApplication(appRef, CurrentUser.get()));
    }

    @PostMapping("/{appRef}/refer-to-senior")
    public ResponseEntity<LoanApplication> referToSenior(@PathVariable String appRef, @RequestBody Map<String, Object> body) {
        caseAccess.visible(appRef);
        Object toRole = body.get("toRole");
        return ResponseEntity.ok(decisioningService.referToSeniorUnderwriter(appRef, CurrentUser.get(), reasonOf(body),
                toRole instanceof String s ? s : null));
    }

    @PostMapping("/{appRef}/disbursement/authorise")
    public ResponseEntity<LoanApplication> authoriseFundRelease(@PathVariable String appRef) {
        caseAccess.visible(appRef);
        return ResponseEntity.ok(decisioningService.authoriseFundRelease(appRef, CurrentUser.get()));
    }

    @PostMapping("/{appRef}/disbursement/second-check")
    public ResponseEntity<LoanApplication> submitForSecondCheck(@PathVariable String appRef) {
        caseAccess.visible(appRef);
        return ResponseEntity.ok(decisioningService.submitForSecondCheck(appRef, CurrentUser.get()));
    }
}
