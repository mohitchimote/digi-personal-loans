package com.digibank.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class LoginOtpRequest {

    @NotBlank(message = "National ID is required")
    @Pattern(regexp = "\\d{9}", message = "National ID must be 9 digits")
    private String nationalId;

    public String getNationalId() { return nationalId; }
    public void setNationalId(String nationalId) { this.nationalId = nationalId; }
}
