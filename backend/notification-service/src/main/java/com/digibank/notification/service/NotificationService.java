package com.digibank.notification.service;

import com.digibank.notification.model.Notification;
import com.digibank.notification.repository.NotificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
public class NotificationService {

    private final NotificationRepository repository;

    public NotificationService(NotificationRepository repository) {
        this.repository = repository;
    }

    public Notification createNotification(Long customerId, String title, String message, String type, String appRef) {
        return repository.save(Notification.builder()
                .customerId(customerId)
                .title(title)
                .message(message)
                .type(type)
                .applicationRef(appRef)
                .read(false)
                .build());
    }

    public List<Notification> getNotifications(Long customerId) {
        return repository.findByCustomerIdOrderByCreatedAtDesc(customerId);
    }

    public long getUnreadCount(Long customerId) {
        return repository.countByCustomerIdAndReadFalse(customerId);
    }

    @Transactional
    public void markAsRead(Long notificationId) {
        repository.findById(notificationId).ifPresent(n -> {
            n.setRead(true);
            repository.save(n);
        });
    }

    @Transactional
    public void markAllAsRead(Long customerId) {
        List<Notification> unread = repository.findByCustomerIdAndReadFalse(customerId);
        unread.forEach(n -> n.setRead(true));
        repository.saveAll(unread);
    }

    public void seedWelcomeNotifications(Long customerId) {
        List<Map<String, String>> welcomeMessages = List.of(
            Map.of("title", "Welcome to DigiBank Personal Loans",
                   "message", "Thank you for choosing DigiBank. We're here to help you find the right personal loan for your needs. Our application process is quick, transparent, and entirely digital.",
                   "type", "SUCCESS"),
            Map.of("title", "Documents You'll Need",
                   "message", "To complete your application you will need: recent payslips (last 3 months), bank statements (last 6 months), a valid ID document, and proof of address dated within 3 months.",
                   "type", "INFO"),
            Map.of("title", "Your Application is Auto-Saved",
                   "message", "Don't worry about losing progress — your application is automatically saved after each section. You can return at any time to complete it from where you left off.",
                   "type", "INFO")
        );

        welcomeMessages.forEach(m -> createNotification(
                customerId, m.get("title"), m.get("message"), m.get("type"), null));
    }
}
