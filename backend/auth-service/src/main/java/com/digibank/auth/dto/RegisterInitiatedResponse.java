package com.digibank.auth.dto;

public class RegisterInitiatedResponse {
    private String email;
    // Demo-environment only: there is no SendGrid/Resend/Twilio integration wired up yet,
    // so the OTP is echoed back here for the UI to display instead of being sent out-of-band.
    private String demoOtp;
    private long otpExpiresInSeconds;

    public RegisterInitiatedResponse() {}

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getDemoOtp() { return demoOtp; }
    public void setDemoOtp(String demoOtp) { this.demoOtp = demoOtp; }
    public long getOtpExpiresInSeconds() { return otpExpiresInSeconds; }
    public void setOtpExpiresInSeconds(long otpExpiresInSeconds) { this.otpExpiresInSeconds = otpExpiresInSeconds; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final RegisterInitiatedResponse r = new RegisterInitiatedResponse();
        public Builder email(String v) { r.email = v; return this; }
        public Builder demoOtp(String v) { r.demoOtp = v; return this; }
        public Builder otpExpiresInSeconds(long v) { r.otpExpiresInSeconds = v; return this; }
        public RegisterInitiatedResponse build() { return r; }
    }
}
