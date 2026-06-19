package com.digibank.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public class OtpResendRequest {

    @NotBlank(message = "Email is required")
    @Email(message = "Must be a valid email address")
    private String email;

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
}
