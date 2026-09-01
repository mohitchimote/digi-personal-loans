package com.digibank.notification.email;

import com.digibank.notification.email.dto.SendEmailRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Internal service-to-service endpoint — called by application-service's EmailClient after a
 * lifecycle event, never by the frontend directly. Gated only by the blanket
 * .anyRequest().authenticated() in SecurityConfig (same as NotificationController's /create and
 * document-service's /generate — none of these cross-service calls carry the original caller's
 * Authorization header today, a pre-existing gap tracked in PRODUCTION_READINESS.md, not
 * introduced here).
 */
@RestController
public class EmailDeliveryController {

    private final EmailDeliveryService deliveryService;

    public EmailDeliveryController(EmailDeliveryService deliveryService) {
        this.deliveryService = deliveryService;
    }

    @PostMapping("/api/notifications/email/send")
    public ResponseEntity<Void> send(@RequestBody SendEmailRequest req) {
        deliveryService.sendTemplatedEmail(req.getEventKey(), req.getCustomerEmail(), req.getVariables());
        return ResponseEntity.ok().build();
    }
}
