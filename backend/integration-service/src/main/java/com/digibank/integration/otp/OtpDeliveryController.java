package com.digibank.integration.otp;

import com.digibank.integration.otp.dto.OtpDeliveryRequest;
import com.digibank.integration.otp.dto.OtpDeliveryResult;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Internal-only contract (no api-gateway route) — auth-service's
 * otpdelivery.IntegrationServiceOtpDeliveryAdapter calls this after generating and persisting an
 * OTP against the User entity (auth-service still owns that — this service holds no user table). */
@RestController
@RequestMapping("/internal/integration/otp")
public class OtpDeliveryController {

    private final OtpDeliveryService service;

    public OtpDeliveryController(OtpDeliveryService service) {
        this.service = service;
    }

    @PostMapping("/deliver")
    public ResponseEntity<OtpDeliveryResult> deliver(@RequestBody OtpDeliveryRequest request) {
        return ResponseEntity.ok(service.deliver(request));
    }
}
