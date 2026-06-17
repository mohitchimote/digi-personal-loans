package com.digibank.notification.repository;

import com.digibank.notification.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findByCustomerIdOrderByCreatedAtDesc(Long customerId);
    List<Notification> findByCustomerIdAndReadFalse(Long customerId);
    long countByCustomerIdAndReadFalse(Long customerId);
}
