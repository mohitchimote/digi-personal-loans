package com.digibank.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class LoginVerifyRequest {

    @NotBlank(message = "National ID is required")
    @Pattern(regexp = "\\d{9}", message = "National ID must be 9 digits")
    private String nationalId;

    @NotBlank(message = "OTP code is required")
    private String otp;

    public String getNationalId() { return nationalId; }
    public void setNationalId(String nationalId) { this.nationalId = nationalId; }
    public String getOtp() { return otp; }
    public void setOtp(String otp) { this.otp = otp; }
}
