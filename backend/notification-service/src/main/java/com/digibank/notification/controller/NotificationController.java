package com.digibank.notification.controller;

import com.digibank.notification.config.AppException;
import com.digibank.notification.model.Notification;
import com.digibank.notification.security.OwnershipCheck;
import com.digibank.notification.security.CurrentUser;
import com.digibank.notification.service.NotificationService;
import com.digibank.notification.util.OpaqueId;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    // Staff can act on any customer's notifications; a customer may reach only their own (S6).
    // "Staff" comes from the token, not a hard-coded list of role names (see OwnershipCheck).
    private static void assertOwnsCustomerId(Long customerId) {
        OwnershipCheck.assertOwnsCustomer(CurrentUser.get(), customerId);
    }

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<Notification>> getNotifications(@PathVariable Long customerId) {
        assertOwnsCustomerId(customerId);
        return ResponseEntity.ok(notificationService.getNotifications(customerId));
    }

    @GetMapping("/customer/{customerId}/unread-count")
    public ResponseEntity<Map<String, Long>> getUnreadCount(@PathVariable Long customerId) {
        assertOwnsCustomerId(customerId);
        return ResponseEntity.ok(Map.of("count", notificationService.getUnreadCount(customerId)));
    }

    @PutMapping("/{id}/read")
    public ResponseEntity<Void> markAsRead(@PathVariable String id) {
        Long decoded = OpaqueId.decode("ntf", id);
        assertOwnsCustomerId(notificationService.getById(decoded).getCustomerId());
        notificationService.markAsRead(decoded);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/customer/{customerId}/read-all")
    public ResponseEntity<Void> markAllAsRead(@PathVariable Long customerId) {
        assertOwnsCustomerId(customerId);
        notificationService.markAllAsRead(customerId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/create")
    public ResponseEntity<Notification> createNotification(@RequestBody Map<String, Object> body) {
        Long customerId = Long.valueOf(body.get("customerId").toString());
        String title = (String) body.get("title");
        String message = (String) body.get("message");
        String type = (String) body.getOrDefault("type", "INFO");
        String appRef = (String) body.get("applicationRef");
        return ResponseEntity.ok(notificationService.createNotification(customerId, title, message, type, appRef));
    }

    @PostMapping("/customer/{customerId}/seed-welcome")
    public ResponseEntity<Void> seedWelcome(@PathVariable Long customerId,
                                            @RequestBody(required = false) Map<String, Object> body) {
        // Worker: any body that is not {lang:"he"} (including none) means English.
        String lang = body != null && "he".equals(body.get("lang")) ? "he" : "en";
        notificationService.seedWelcomeNotifications(customerId, lang);
        return ResponseEntity.ok().build();
    }

    /**
     * Internal contract for the workflow host: the customer's stored language (users.preferred_language,
     * owned by auth-service) is passed in as "lang"; the wording is chosen here. Returns the stored
     * notification, or 204 when the template name is unknown (the Worker then sends nothing).
     */
    @PostMapping("/create-from-template")
    public ResponseEntity<Notification> createFromTemplate(@RequestBody Map<String, Object> body) {
        Object customerId = body.get("customerId");
        if (customerId == null) throw new AppException("customerId is required.");
        @SuppressWarnings("unchecked")
        Map<String, Object> vars = body.get("vars") instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
        Notification created = notificationService.createFromTemplate(
                Long.valueOf(customerId.toString()),
                (String) body.get("template"),
                (String) body.get("lang"),
                (String) body.get("firstName"),
                (String) body.get("loanPurpose"),
                (String) body.get("applicationRef"),
                vars);
        return created == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(created);
    }
}
