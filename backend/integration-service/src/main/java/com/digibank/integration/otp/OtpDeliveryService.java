package com.digibank.integration.otp;

import com.digibank.integration.otp.dto.OtpDeliveryRequest;
import com.digibank.integration.otp.dto.OtpDeliveryResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Simulated OTP/SMS/Email delivery (ARCHITECTURE_REVIEW_GAPS.md, G5) — no real SMS/email provider
 * is wired up (auth-service's OtpService still returns the code directly in its own API response
 * for on-screen display, exactly as before; that's unrelated to and unaffected by this class). This
 * exists so the delivery attempt travels through a real internal service call instead of being a
 * no-op inside auth-service, so wiring in a real Twilio/SES-style provider later means adding a
 * second branch here, not touching any caller.
 *
 * Deliberately never logs the code itself — logging exists to prove a delivery attempt was made,
 * not to give a second, quieter place the code is visible.
 */
@Component
public class OtpDeliveryService {

    private static final Logger log = LoggerFactory.getLogger(OtpDeliveryService.class);

    public OtpDeliveryResult deliver(OtpDeliveryRequest request) {
        log.info("Simulated OTP delivery via {} to {}", request.getChannel(), mask(request.getDestination()));

        OtpDeliveryResult result = new OtpDeliveryResult();
        result.setDelivered(true);
        result.setProvider("SIMULATED");
        result.setMessageId(UUID.randomUUID().toString());
        return result;
    }

    private String mask(String destination) {
        if (destination == null || destination.length() < 4) return "***";
        return "***" + destination.substring(destination.length() - 4);
    }
}
