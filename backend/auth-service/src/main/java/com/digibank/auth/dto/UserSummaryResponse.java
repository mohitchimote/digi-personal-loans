package com.digibank.auth.dto;

import com.digibank.auth.model.User;
import java.time.LocalDateTime;

public class UserSummaryResponse {
    private Long id;
    private String email;
    private String nationalId;
    private String fullName;
    private String phoneNumber;
    private String role;
    private boolean enabled;
    private LocalDateTime createdAt;
    private LocalDateTime lastLogin;

    public static UserSummaryResponse from(User u) {
        UserSummaryResponse r = new UserSummaryResponse();
        r.id = u.getId();
        r.email = u.getEmail();
        r.nationalId = u.getNationalId();
        r.fullName = u.getFullName();
        r.phoneNumber = u.getPhoneNumber();
        r.role = u.getRole();
        r.enabled = u.isEnabled();
        r.createdAt = u.getCreatedAt();
        r.lastLogin = u.getLastLogin();
        return r;
    }

    public Long getId() { return id; }
    public String getEmail() { return email; }
    public String getNationalId() { return nationalId; }
    public String getFullName() { return fullName; }
    public String getPhoneNumber() { return phoneNumber; }
    public String getRole() { return role; }
    public boolean isEnabled() { return enabled; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getLastLogin() { return lastLogin; }
}
