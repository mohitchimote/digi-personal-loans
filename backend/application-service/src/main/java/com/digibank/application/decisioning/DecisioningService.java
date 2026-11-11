package com.digibank.application.decisioning;

import com.digibank.application.model.LoanApplication;
import com.digibank.application.model.UnderwritingNote;
import com.digibank.application.security.AuthenticatedUser;
import com.digibank.application.workflow.IdempotencyKeys;
import com.digibank.application.workflow.WorkflowActions;
import com.digibank.application.workflow.WorkflowActions.Run;
import com.digibank.application.workflow.WorkflowActor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Decisioning & mandates context (ARCHITECTURE.md §10): approve, decline, refer, send back, the disbursement steps
 * and notes. Each is a workflow action: which statuses it may start from, who may do it, the referral lock, the
 * mandate limit, and what it does to the case (status, notes, notifications, emails, documents, referral rows) are
 * defined by the published workflow definition and decided by workflow-service; this class names the action,
 * passes the inputs and returns the case. It re-implements none of those rules. The HTTP routes are unchanged
 * (the Worker keeps them too); the generic route is workflow.WorkflowActionController.
 */
@Service
public class DecisioningService {

    private final WorkflowActions actions;

    public DecisioningService(WorkflowActions actions) {
        this.actions = actions;
    }

    private LoanApplication act(String appRef, AuthenticatedUser caller, String action, Map<String, Object> input) {
        return actions.run(appRef, Run.of(action, WorkflowActor.of(caller)).withInput(input).withKey(IdempotencyKeys.current())).application();
    }

    public LoanApplication declineApplication(String appRef, AuthenticatedUser caller, String reason) {
        return act(appRef, caller, "decline", input("reason", reason));
    }

    public LoanApplication sendBackApplication(String appRef, AuthenticatedUser caller, String reason, boolean requireGuarantor) {
        return act(appRef, caller, "send_back", input("reason", reason, "requireGuarantor", requireGuarantor));
    }

    public LoanApplication approveApplicationByUnderwriter(String appRef, AuthenticatedUser caller, BigDecimal approvedAmount) {
        return act(appRef, caller, "approve", input("approvedAmount", approvedAmount));
    }

    /** POST /approve: the conditional approval. */
    public LoanApplication approveApplication(String appRef, AuthenticatedUser caller) {
        return act(appRef, caller, "approve_conditional", Map.of());
    }

    public LoanApplication referToSeniorUnderwriter(String appRef, AuthenticatedUser caller, String reason, String toRole) {
        return act(appRef, caller, "refer", input("reason", reason, "toRole", toRole));
    }

    public LoanApplication authoriseFundRelease(String appRef, AuthenticatedUser caller) {
        return act(appRef, caller, "authorise", Map.of());
    }

    public LoanApplication submitForSecondCheck(String appRef, AuthenticatedUser caller) {
        return act(appRef, caller, "second_check", Map.of());
    }

    /** POST /notes: the note types that ask the customer for something are workflow actions of their own (as in the Worker). */
    public UnderwritingNote addNote(String appRef, AuthenticatedUser caller, String section, String text, String noteType) {
        String action = "CLARIFICATION_REQUEST".equals(noteType) ? "request_clarification"
                : "DOCUMENT_REQUEST".equals(noteType) ? "request_documents" : "add_note";
        Map<String, Object> in = input("section", section, "text", text, "noteType", noteType);
        return actions.run(appRef, Run.of(action, WorkflowActor.of(caller)).withInput(in).withKey(IdempotencyKeys.current())).note();
    }

    /** Null values are kept (the engine reads a missing input and a null one the same way). */
    private static Map<String, Object> input(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }
}
