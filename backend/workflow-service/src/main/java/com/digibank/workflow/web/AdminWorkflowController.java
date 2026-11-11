package com.digibank.workflow.web;

import com.digibank.workflow.engine.Catalog;
import com.digibank.workflow.engine.DefinitionValidator;
import com.digibank.workflow.engine.Js;
import com.digibank.workflow.model.WfDefinition;
import com.digibank.workflow.security.AuthenticatedUser;
import com.digibank.workflow.security.CurrentUser;
import com.digibank.workflow.service.AuditSink;
import com.digibank.workflow.service.DefinitionService;
import com.digibank.workflow.service.Json;
import com.digibank.workflow.service.WorkflowException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The admin workflow builder API (the Worker's routes/admin-workflow.ts, same paths and shapes): versioned definitions,
 * DRAFT -> PUBLISHED -> ARCHIVED. Validation errors come back as a list so the builder can show every problem at once.
 * ADMIN only (SecurityConfig). The URL stays under /api/auth/admin for frontend compatibility; the gateway routes it here
 * ahead of the auth-service catch-all.
 */
@RestController
@RequestMapping("/api/auth/admin/workflow")
public class AdminWorkflowController {

    private final DefinitionService definitions;
    private final AuditSink audit;

    public AdminWorkflowController(DefinitionService definitions, AuditSink audit) {
        this.definitions = definitions;
        this.audit = audit;
    }

    private static AuthenticatedUser who() {
        return CurrentUser.get();
    }

    private void audit(String type, WfDefinition row, String detail) {
        audit.record(type, "WorkflowDefinition", String.valueOf(row.id), who().displayName(), who().role(), detail);
    }

    private static ResponseEntity<Map<String, Object>> invalid(String message, List<String> errors) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("message", message);
        body.put("errors", errors);
        return ResponseEntity.badRequest().body(body);
    }

    private static long idOf(String raw) {
        try { return Long.parseLong(raw); } catch (NumberFormatException e) { throw new WorkflowException("Workflow definition not found: " + raw, 404); }
    }

    /** Everything a builder needs to offer choices: the guard and effect primitives code supports and the entitlement catalog. */
    @GetMapping("/catalog")
    public Map<String, Object> catalog() {
        return Catalog.catalogJson();
    }

    @GetMapping("/definitions")
    public List<Map<String, Object>> list() {
        return definitions.list();
    }

    @GetMapping("/definitions/{id}")
    public Map<String, Object> get(@PathVariable String id) {
        WfDefinition row = definitions.getRow(idOf(id));
        Map<String, Object> out = definitions.summary(row);
        out.put("definition", Json.parseMap(row.definitionJson));
        return out;
    }

    /** Stateless check for the builder's live validation: nothing is saved. */
    @PostMapping("/validate")
    public Map<String, Object> validate(@RequestBody Map<String, Object> body) {
        if (!body.containsKey("definition")) throw new WorkflowException("definition is required.", 400);
        DefinitionValidator.Result r = DefinitionValidator.validate(body.get("definition"), Catalog.ENTITLEMENT_KEYS);
        return Js.obj("ok", r.ok(), "errors", r.errors());
    }

    @PostMapping("/definitions/{key}/draft")
    public ResponseEntity<Map<String, Object>> draft(@PathVariable String key, @RequestBody(required = false) Map<String, Object> body) {
        Object source = body == null ? null : body.get("sourceId");
        if (source != null && !(source instanceof Number n && n.doubleValue() == Math.rint(n.doubleValue()))) throw new WorkflowException("sourceId must be an integer.", 400);
        DefinitionService.DraftResult r = definitions.createDraft(key, source == null ? null : ((Number) source).longValue(), who().displayName());
        if (!r.existing()) audit("WORKFLOW_DRAFT_CREATED", r.row(), r.row().definitionKey + " v" + r.row().version);
        Map<String, Object> out = definitions.summary(r.row());
        out.put("existing", r.existing());
        return ResponseEntity.status(r.existing() ? 200 : 201).body(out);
    }

    @PutMapping("/definitions/{id}")
    public ResponseEntity<Map<String, Object>> save(@PathVariable String id, @RequestBody Map<String, Object> body) {
        if (!body.containsKey("definition")) throw new WorkflowException("definition is required.", 400);
        Object note = body.get("changeNote");
        if (note != null && !(note instanceof String s && s.length() <= 300)) throw new WorkflowException("changeNote must be at most 300 characters.", 400);
        DefinitionService.SaveResult r = definitions.saveDraft(idOf(id), body.get("definition"), (String) note);
        if (!r.ok()) return invalid("The definition is not valid.", r.errors());
        audit("WORKFLOW_DRAFT_SAVED", r.row(), (String) note);
        return ResponseEntity.ok(definitions.summary(r.row()));
    }

    @PostMapping("/definitions/{id}/publish")
    public ResponseEntity<Map<String, Object>> publish(@PathVariable String id) {
        DefinitionService.SaveResult r = definitions.publishDraft(idOf(id), who().displayName());
        if (!r.ok()) return invalid("The definition cannot be published.", r.errors());
        audit("WORKFLOW_DEFINITION_PUBLISHED", r.row(), r.row().definitionKey + " v" + r.row().version);
        return ResponseEntity.ok(definitions.summary(r.row()));
    }

    @DeleteMapping("/definitions/{id}")
    public ResponseEntity<Void> discard(@PathVariable String id) {
        long n = idOf(id);
        definitions.discardDraft(n);
        audit.record("WORKFLOW_DRAFT_DISCARDED", "WorkflowDefinition", String.valueOf(n), who().displayName(), who().role(), null);
        return ResponseEntity.noContent().build();
    }
}
