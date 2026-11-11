package com.digibank.application.workflow;

import com.digibank.application.client.WorkflowClient;
import com.digibank.application.config.ApiException;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.security.CaseAccess;
import com.digibank.application.security.CurrentUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * POST /api/workflow/cases/{ref}/actions/{action}: runs any action the published workflow defines, as the Worker's
 * routes/workflow.ts does. This is what lets an admin add an action in the builder and have it work without a new
 * route: the definition decides who may run it, from which status, its guards and its effects (the same evaluation
 * every dedicated route goes through, via WorkflowActions). The gateway sends this one path here instead of to
 * workflow-service because the effects need this service's data (see backend/workflow-service/README.md).
 *
 * Who may call it: the case must be visible to the caller (staff: org scope; customer: their own case), else 404, so
 * a transition built in the builder that lacks a CASE_VISIBLE guard still cannot be a way around who can see a case.
 * The action's own entitlement (case.*), its allowed actors and OWNER_OR_ASSISTING are the engine's.
 */
@RestController
@RequestMapping("/api/workflow/cases")
public class WorkflowActionController {

    /** Actions that carry data the host must validate and store itself keep their dedicated routes: running them here would move the case without that data. */
    static final Set<String> DEDICATED_ROUTE_ACTIONS = Set.of("save_section", "edit_section", "select_product");

    private static final ObjectMapper JSON = new ObjectMapper();

    private final WorkflowActions actions;
    private final WorkflowClient workflow;
    private final LoanApplicationRepository repository;
    private final CaseAccess caseAccess;

    public WorkflowActionController(WorkflowActions actions, WorkflowClient workflow, LoanApplicationRepository repository, CaseAccess caseAccess) {
        this.actions = actions;
        this.workflow = workflow;
        this.repository = repository;
        this.caseAccess = caseAccess;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> inputOf(String raw) {
        if (raw == null || raw.isBlank()) return Map.of();
        try {
            Object body = JSON.readValue(raw, Object.class);
            if (body instanceof Map<?, ?> m && m.get("input") instanceof Map<?, ?> in) return new LinkedHashMap<>((Map<String, Object>) in);
        } catch (Exception ignored) {
            // an unreadable body is an empty input, as in the Worker
        }
        return Map.of();
    }

    @PostMapping("/{ref}/actions/{action}")
    public ResponseEntity<Map<String, Object>> run(@PathVariable String ref, @PathVariable String action,
                                                   @RequestBody(required = false) String body,
                                                   @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (DEDICATED_ROUTE_ACTIONS.contains(action)) throw new ApiException(400, action + " carries form data and has its own endpoint.");
        LoanApplication app = repository.findByApplicationRef(ref).orElseThrow(() -> new ApiException(404, "Application not found."));
        caseAccess.assertVisible(app);

        WorkflowActions.Result result = actions.run(ref, WorkflowActions.Run.of(action, WorkflowActor.of(CurrentUser.get()))
                .withInput(inputOf(body)).withKey(IdempotencyKeys.current()));

        // The action has committed. Listing what is offered next is a convenience: if it fails the caller still gets the
        // success it earned (and asks again on its own) rather than an error for work that happened.
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("application", result.application());
        out.put("actions", workflow.actionsFor(ref, authorization));
        return ResponseEntity.ok(out);
    }
}
