package com.digibank.notification.service;

import com.digibank.notification.config.AppException;
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

    // S6 (ARCHITECTURE_REVIEW_GAPS.md) — lets the controller check ownership (compare the
    // authenticated caller against the notification's own customerId) before mutating it.
    public Notification getById(Long notificationId) {
        return repository.findById(notificationId)
                .orElseThrow(() -> new AppException("Notification not found.", 404));
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

    /** The Worker's seed-welcome: the customer's language picks the texts ("he", else English). */
    public void seedWelcomeNotifications(Long customerId, String lang) {
        NotificationTemplates.welcome(lang).forEach(m -> createNotification(
                customerId, m.title(), m.message(), m.type(), null));
    }

    /** Builds the bilingual text for a workflow event and stores it; null when the template is unknown. */
    public Notification createFromTemplate(Long customerId, String template, String lang, String firstName,
                                           String loanPurpose, String applicationRef, Map<String, Object> vars) {
        NotificationTemplates.Spec spec = NotificationTemplates.buildNotification(
                template, firstName, loanPurpose, lang, vars == null ? Map.of() : vars);
        if (spec == null) return null;
        return createNotification(customerId, spec.title(), spec.message(), spec.type(), applicationRef);
    }
}
