package com.digibank.application.workflow;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * POST /api/applications/admin/workflow-backfill (ADMIN): registers every existing application with workflow-service.
 * The same routine runs at startup; this is for when workflow-service was not up then, or for a re-sync. Idempotent:
 * only what is missing is created, summaries are refreshed, workflow state of known cases is never touched.
 * Answers {created, updated, failed:[{applicationRef,error}], batches}.
 */
@RestController
@RequestMapping("/api/applications/admin")
public class WorkflowAdminController {

    private final WorkflowCases cases;

    public WorkflowAdminController(WorkflowCases cases) {
        this.cases = cases;
    }

    @PostMapping("/workflow-backfill")
    public ResponseEntity<Map<String, Object>> backfill() {
        return ResponseEntity.ok(cases.backfillAll());
    }
}
