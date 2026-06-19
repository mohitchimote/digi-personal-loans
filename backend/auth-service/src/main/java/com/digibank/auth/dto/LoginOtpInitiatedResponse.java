package com.digibank.auth.dto;

public class LoginOtpInitiatedResponse {
    private String nationalId;
    // Demo-environment only: there is no SMS gateway wired up yet,
    // so the OTP is echoed back here for the UI to display instead of being sent out-of-band.
    private String demoOtp;
    private long otpExpiresInSeconds;

    public LoginOtpInitiatedResponse() {}

    public String getNationalId() { return nationalId; }
    public void setNationalId(String nationalId) { this.nationalId = nationalId; }
    public String getDemoOtp() { return demoOtp; }
    public void setDemoOtp(String demoOtp) { this.demoOtp = demoOtp; }
    public long getOtpExpiresInSeconds() { return otpExpiresInSeconds; }
    public void setOtpExpiresInSeconds(long otpExpiresInSeconds) { this.otpExpiresInSeconds = otpExpiresInSeconds; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final LoginOtpInitiatedResponse r = new LoginOtpInitiatedResponse();
        public Builder nationalId(String v) { r.nationalId = v; return this; }
        public Builder demoOtp(String v) { r.demoOtp = v; return this; }
        public Builder otpExpiresInSeconds(long v) { r.otpExpiresInSeconds = v; return this; }
        public LoginOtpInitiatedResponse build() { return r; }
    }
}
