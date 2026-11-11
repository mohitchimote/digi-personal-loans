package com.digibank.application.formbuilder;

import com.digibank.application.config.ApiException;
import com.digibank.application.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Admin form builder, the port of worker/src/routes/admin-form-builder.ts. Same paths as the Worker
 * (/api/auth/admin/form-builder/**, which the gateway routes here ahead of its auth-service catch-all)
 * and the same response shapes. ADMIN only, enforced in SecurityConfig.
 */
@RestController
@RequestMapping("/api/auth/admin/form-builder")
public class FormBuilderAdminController {

    private final FormVersionService service;

    public FormBuilderAdminController(FormVersionService service) {
        this.service = service;
    }

    private static void requireKnownFormKey(String formKey) {
        if (!FormSchemaValidator.isFormKey(formKey)) throw new IllegalArgumentException("Unknown form: " + formKey);
    }

    private static Long parseId(String raw) {
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException e) {
            throw new ApiException(404, "Form version not found.");
        }
    }

    private static Map<String, Object> envelope(String message, Object data) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", message);
        body.put("data", data);
        return body;
    }

    /** One row per formKey: its published version's summary (or null) plus a draft and total count. */
    @GetMapping("/forms")
    public List<Map<String, Object>> forms() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String formKey : FormSchemaValidator.FORM_KEYS) {
            List<FormVersion> versions = service.list(formKey);
            FormVersion published = versions.stream().filter(v -> "PUBLISHED".equals(v.getStatus())).findFirst().orElse(null);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("formKey", formKey);
            if (published == null) {
                row.put("published", null);
            } else {
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("id", published.getId());
                p.put("version", published.getVersion());
                p.put("publishedAt", published.getPublishedAt());
                p.put("publishedBy", published.getPublishedBy());
                row.put("published", p);
            }
            row.put("draftCount", versions.stream().filter(v -> "DRAFT".equals(v.getStatus())).count());
            row.put("totalVersions", versions.size());
            out.add(row);
        }
        return out;
    }

    /** Every version of a form, newest first, without the (large) schema. */
    @GetMapping("/forms/{formKey}/versions")
    public List<Map<String, Object>> versions(@PathVariable String formKey) {
        requireKnownFormKey(formKey);
        List<Map<String, Object>> out = new ArrayList<>();
        for (FormVersion v : service.list(formKey)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", v.getId());
            row.put("formKey", v.getFormKey());
            row.put("version", v.getVersion());
            row.put("status", v.getStatus());
            row.put("changeNote", v.getChangeNote());
            row.put("createdAt", v.getCreatedAt());
            row.put("createdBy", v.getCreatedBy());
            row.put("publishedAt", v.getPublishedAt());
            row.put("publishedBy", v.getPublishedBy());
            out.add(row);
        }
        return out;
    }

    @GetMapping("/versions/{id}")
    public FormVersion version(@PathVariable String id) {
        return service.getById(parseId(id)).orElseThrow(() -> new ApiException(404, "Form version not found."));
    }

    @PostMapping("/forms/{formKey}/draft")
    public ResponseEntity<Map<String, Object>> createDraft(@PathVariable String formKey,
                                                           @RequestBody(required = false) Map<String, Object> body) {
        requireKnownFormKey(formKey);
        Map<String, Object> b = body == null ? Map.of() : body;
        rejectUnknownKeys(b, Set.of("sourceVersionId"));
        Long sourceId = null;
        Object raw = b.get("sourceVersionId");
        if (raw != null) {
            if (!(raw instanceof Number n)) throw new IllegalArgumentException("Invalid request body: sourceVersionId must be a number or null.");
            sourceId = n.longValue();
        }
        FormVersion draft = service.createDraftFrom(formKey, sourceId, emailOrName());
        return ResponseEntity.status(HttpStatus.CREATED).body(envelope("Draft created.", draft));
    }

    @PutMapping("/versions/{id}")
    public Map<String, Object> updateDraft(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        rejectUnknownKeys(b, Set.of("schemaJson", "changeNote"));
        Object schema = b.get("schemaJson");
        if (schema != null && !(schema instanceof String)) throw new IllegalArgumentException("Invalid request body: schemaJson must be a string.");
        Object note = b.get("changeNote");
        if (note != null && !(note instanceof String)) throw new IllegalArgumentException("Invalid request body: changeNote must be a string or null.");
        FormVersion updated = service.updateDraft(parseId(id), (String) schema, b.containsKey("changeNote"), (String) note);
        return envelope("Draft saved.", updated);
    }

    @PostMapping("/versions/{id}/publish")
    public Map<String, Object> publish(@PathVariable String id) {
        FormVersion published = service.publish(parseId(id), emailOrName());
        return envelope("Published as v" + published.getVersion() + ".", published);
    }

    @DeleteMapping("/versions/{id}")
    public Map<String, Object> discard(@PathVariable String id) {
        service.discardDraft(parseId(id));
        return envelope("Draft discarded.", null);
    }

    /** The currently published version of a form (what the builder's preview pane renders). */
    @GetMapping("/forms/{formKey}/published")
    public FormVersion published(@PathVariable String formKey) {
        requireKnownFormKey(formKey);
        return service.getPublished(formKey).orElseThrow(() -> new ApiException(404, "No published version for this form yet."));
    }

    /** The Worker records the admin's email; the token carries the name, which is the closest identity here. */
    private static String emailOrName() {
        var u = CurrentUser.get();
        return u.email() != null && !u.email().isBlank() ? u.email() : u.displayName();
    }

    private static void rejectUnknownKeys(Map<String, Object> body, Set<String> allowed) {
        for (String k : body.keySet()) {
            if (!allowed.contains(k)) throw new IllegalArgumentException("Invalid request body: unrecognized key '" + k + "'.");
        }
    }
}
