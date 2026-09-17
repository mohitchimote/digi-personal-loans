package com.digibank.notification.controller;

import com.digibank.notification.model.Notification;
import com.digibank.notification.security.AuthenticatedUser;
import com.digibank.notification.security.CurrentUser;
import com.digibank.notification.service.NotificationService;
import com.digibank.notification.util.OpaqueId;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    // Same duplicated list as the other services (tracked as Q2) — staff can act on any
    // customer's notifications; a customer may only reach their own (S6).
    private static final Set<String> STAFF_ROLES = Set.of(
            "BANKER", "UNDERWRITER", "SENIOR_UNDERWRITER", "HEAD_OF_LENDING", "COO", "CEO", "ADMIN");

    private static void assertOwnsCustomerId(Long customerId) {
        AuthenticatedUser user = CurrentUser.get();
        if (STAFF_ROLES.contains(user.role())) return;
        if (!user.userId().equals(customerId)) {
            throw new AccessDeniedException("Forbidden.");
        }
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
    public ResponseEntity<Void> seedWelcome(@PathVariable Long customerId) {
        notificationService.seedWelcomeNotifications(customerId);
        return ResponseEntity.ok().build();
    }
}
