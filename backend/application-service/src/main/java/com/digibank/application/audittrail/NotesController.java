package com.digibank.application.audittrail;

import com.digibank.application.model.UnderwritingNote;
import com.digibank.application.security.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Audit-trail context (ARCHITECTURE.md §10) — split out of the old ApplicationController.
 * Endpoint paths unchanged (/api/applications/{appRef}/notes).
 */
@RestController
@RequestMapping("/api/applications")
public class NotesController {

    private final AuditTrailService auditTrailService;

    public NotesController(AuditTrailService auditTrailService) {
        this.auditTrailService = auditTrailService;
    }

    @PostMapping("/{appRef}/notes")
    public ResponseEntity<UnderwritingNote> addNote(@PathVariable String appRef, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(auditTrailService.addNote(
                appRef, body.get("section"), body.get("note"), body.getOrDefault("noteType", "NOTE"), CurrentUser.get().displayName()));
    }

    @GetMapping("/{appRef}/notes")
    public ResponseEntity<List<UnderwritingNote>> getNotes(@PathVariable String appRef) {
        return ResponseEntity.ok(auditTrailService.getNotes(appRef));
    }
}
