package com.digibank.auth.dto;

public class CreateStaffRequest {
    private String email;
    private String fullName;
    private String nationalId;
    private String phoneNumber;
    private String role;

    public String getEmail() { return email; }
    public String getFullName() { return fullName; }
    public String getNationalId() { return nationalId; }
    public String getPhoneNumber() { return phoneNumber; }
    public String getRole() { return role; }
}
