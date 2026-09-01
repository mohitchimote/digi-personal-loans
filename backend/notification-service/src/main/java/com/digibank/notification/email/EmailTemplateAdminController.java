package com.digibank.notification.email;

import com.digibank.notification.email.dto.EmailEventMeta;
import com.digibank.notification.email.dto.EmailTemplateDraft;
import com.digibank.notification.email.dto.EmailTemplateResponse;
import com.digibank.notification.email.dto.UpsertEmailTemplateRequest;
import com.digibank.notification.security.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Own router mounted at /api/auth/admin/email-templates by the gateway (a route override placed
 * before the general /api/auth/** -> auth-service route — see api-gateway/application.yml), even
 * though this is served by notification-service, not auth-service: keeps the frontend's existing
 * email-template.service.ts URL contract unchanged while the email context lives with the rest of
 * outbound communications. ADMIN-only, see SecurityConfig.
 */
@RestController
@RequestMapping("/api/auth/admin/email-templates")
public class EmailTemplateAdminController {

    private final EmailTemplateAdminService service;

    public EmailTemplateAdminController(EmailTemplateAdminService service) {
        this.service = service;
    }

    @GetMapping("/events")
    public ResponseEntity<List<EmailEventMeta>> getEvents() {
        return ResponseEntity.ok(service.getEvents());
    }

    @GetMapping("")
    public ResponseEntity<List<EmailTemplateResponse>> getAllTemplates() {
        return ResponseEntity.ok(service.getAllTemplates());
    }

    @PutMapping("/{eventKey}")
    public ResponseEntity<EmailTemplateResponse> updateTemplate(@PathVariable String eventKey,
                                                                  @RequestBody UpsertEmailTemplateRequest body) {
        String actingUserEmail = CurrentUser.get().email();
        return ResponseEntity.ok(service.updateTemplate(eventKey, body, actingUserEmail));
    }

    @PostMapping("/{eventKey}/preview")
    public ResponseEntity<Map<String, String>> preview(@PathVariable String eventKey, @RequestBody EmailTemplateDraft draft) {
        return ResponseEntity.ok(Map.of("html", service.preview(eventKey, draft)));
    }

    @PostMapping("/{eventKey}/test")
    public ResponseEntity<Map<String, Object>> sendTest(@PathVariable String eventKey, @RequestBody EmailTemplateDraft draft) {
        String actingUserEmail = CurrentUser.get().email();
        DeliverResult result = service.sendTest(eventKey, draft, actingUserEmail);

        Map<String, Object> body = new HashMap<>();
        if (!result.ok()) {
            body.put("success", false);
            body.put("message", result.error());
            body.put("data", null);
            return ResponseEntity.badRequest().body(body);
        }
        body.put("success", true);
        body.put("message", "Test email sent to " + actingUserEmail + ".");
        body.put("data", null);
        return ResponseEntity.ok(body);
    }
}
