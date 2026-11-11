package com.digibank.auth.staffadmin.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class CreateStaffRequest {
    @NotBlank(message = "Email is required")
    @Email(message = "Must be a valid email address")
    private String email;
    @NotBlank(message = "Full name is required")
    private String fullName;
    @NotBlank(message = "National ID is required")
    @Pattern(regexp = "\\d{9}", message = "National ID must be 9 digits")
    private String nationalId;
    private String phoneNumber;
    @NotBlank(message = "Role is required")
    private String role;
    private Long orgUnitId;

    public String getEmail() { return email; }
    public String getFullName() { return fullName; }
    public String getNationalId() { return nationalId; }
    public String getPhoneNumber() { return phoneNumber; }
    public String getRole() { return role; }
    public Long getOrgUnitId() { return orgUnitId; }
}
