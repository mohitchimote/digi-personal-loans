package com.digibank.auth.otpdelivery;

/**
 * The integration seam this context exists around (ARCHITECTURE_REVIEW_GAPS.md, G5) — unlike
 * DataVerificationPort/BusinessFinancialsPort, this one has no prior local simulation to move:
 * OtpService only ever generated/validated the code against the User entity, with delivery handled
 * by echoing the code back in the API response for on-screen display (`demoOtp` in
 * RegisterInitiatedResponse/LoginOtpInitiatedResponse — unchanged, still how the demo works, since
 * no real SMS/email provider exists to actually deliver it). This port introduces a real delivery
 * *attempt* alongside that, so a real SMS/email provider later is a second implementation of this
 * interface, not new plumbing threaded through OtpService/AuthService.
 */
public interface OtpDeliveryPort {
    void deliver(String destination, String channel, String code);
}
