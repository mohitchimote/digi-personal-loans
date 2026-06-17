package com.digibank.notification.controller;

import com.digibank.notification.model.Notification;
import com.digibank.notification.service.NotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
@CrossOrigin(origins = "http://localhost:4200")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<Notification>> getNotifications(@PathVariable Long customerId) {
        return ResponseEntity.ok(notificationService.getNotifications(customerId));
    }

    @GetMapping("/customer/{customerId}/unread-count")
    public ResponseEntity<Map<String, Long>> getUnreadCount(@PathVariable Long customerId) {
        return ResponseEntity.ok(Map.of("count", notificationService.getUnreadCount(customerId)));
    }

    @PutMapping("/{id}/read")
    public ResponseEntity<Void> markAsRead(@PathVariable Long id) {
        notificationService.markAsRead(id);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/customer/{customerId}/read-all")
    public ResponseEntity<Void> markAllAsRead(@PathVariable Long customerId) {
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
