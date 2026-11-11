package com.digibank.application.audittrail;

import com.digibank.application.decisioning.DecisioningService;
import com.digibank.application.model.UnderwritingNote;
import com.digibank.application.security.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Audit-trail context (ARCHITECTURE.md §10) — split out of the old ApplicationController.
 * Endpoint paths unchanged (/api/applications/{appRef}/notes). Adding a note is a workflow action (add_note, or
 * request_clarification / request_documents for the note types that ask the customer for something).
 */
@RestController
@RequestMapping("/api/applications")
public class NotesController {

    private final AuditTrailService auditTrailService;
    private final DecisioningService decisioningService;
    private final com.digibank.application.security.CaseAccess caseAccess;

    public NotesController(AuditTrailService auditTrailService, DecisioningService decisioningService, com.digibank.application.security.CaseAccess caseAccess) {
        this.auditTrailService = auditTrailService;
        this.decisioningService = decisioningService;
        this.caseAccess = caseAccess;
    }

    @PostMapping("/{appRef}/notes")
    public ResponseEntity<UnderwritingNote> addNote(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        caseAccess.visible(appRef);
        return ResponseEntity.ok(decisioningService.addNote(
                appRef, CurrentUser.get(), body.get("section"), body.get("note"), body.getOrDefault("noteType", "NOTE")));
    }

    @GetMapping("/{appRef}/notes")
    public ResponseEntity<List<UnderwritingNote>> getNotes(@PathVariable String appRef) {
        caseAccess.visible(appRef);
        return ResponseEntity.ok(auditTrailService.getNotes(appRef));
    }
}
