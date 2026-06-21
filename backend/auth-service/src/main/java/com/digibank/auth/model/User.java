package com.digibank.auth.model;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String uuid;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(unique = true, nullable = false)
    private String nationalId;

    private LocalDate idIssueDate;

    private String fullName;
    private String phoneNumber;
    private String role = "CUSTOMER";
    private LocalDateTime createdAt;
    private LocalDateTime lastLogin;
    private boolean enabled = true;
    private boolean emailVerified = false;
    private String otpCode;
    private LocalDateTime otpExpiresAt;
    private int otpAttempts = 0;

    // Business accounts only (role = BUSINESS_OWNER) — null for personal customers/staff
    private String companyName;

    @Column(unique = true)
    private String companyRegistrationNumber;

    private String companyIndustry;
    private Integer companyFoundedYear;

    public User() {}

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (uuid == null) uuid = UUID.randomUUID().toString();
    }

    public Long getId() { return id; }
    public String getUuid() { return uuid; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getNationalId() { return nationalId; }
    public void setNationalId(String nationalId) { this.nationalId = nationalId; }
    public LocalDate getIdIssueDate() { return idIssueDate; }
    public void setIdIssueDate(LocalDate idIssueDate) { this.idIssueDate = idIssueDate; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getLastLogin() { return lastLogin; }
    public void setLastLogin(LocalDateTime lastLogin) { this.lastLogin = lastLogin; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public boolean isEmailVerified() { return emailVerified; }
    public void setEmailVerified(boolean emailVerified) { this.emailVerified = emailVerified; }
    public String getOtpCode() { return otpCode; }
    public void setOtpCode(String otpCode) { this.otpCode = otpCode; }
    public LocalDateTime getOtpExpiresAt() { return otpExpiresAt; }
    public void setOtpExpiresAt(LocalDateTime otpExpiresAt) { this.otpExpiresAt = otpExpiresAt; }
    public int getOtpAttempts() { return otpAttempts; }
    public void setOtpAttempts(int otpAttempts) { this.otpAttempts = otpAttempts; }

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }
    public String getCompanyRegistrationNumber() { return companyRegistrationNumber; }
    public void setCompanyRegistrationNumber(String companyRegistrationNumber) { this.companyRegistrationNumber = companyRegistrationNumber; }
    public String getCompanyIndustry() { return companyIndustry; }
    public void setCompanyIndustry(String companyIndustry) { this.companyIndustry = companyIndustry; }
    public Integer getCompanyFoundedYear() { return companyFoundedYear; }
    public void setCompanyFoundedYear(Integer companyFoundedYear) { this.companyFoundedYear = companyFoundedYear; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final User u = new User();
        public Builder email(String v) { u.email = v; return this; }
        public Builder nationalId(String v) { u.nationalId = v; return this; }
        public Builder idIssueDate(LocalDate v) { u.idIssueDate = v; return this; }
        public Builder fullName(String v) { u.fullName = v; return this; }
        public Builder phoneNumber(String v) { u.phoneNumber = v; return this; }
        public Builder role(String v) { u.role = v; return this; }
        public Builder enabled(boolean v) { u.enabled = v; return this; }
        public Builder emailVerified(boolean v) { u.emailVerified = v; return this; }
        public Builder companyName(String v) { u.companyName = v; return this; }
        public Builder companyRegistrationNumber(String v) { u.companyRegistrationNumber = v; return this; }
        public Builder companyIndustry(String v) { u.companyIndustry = v; return this; }
        public Builder companyFoundedYear(Integer v) { u.companyFoundedYear = v; return this; }
        public User build() { return u; }
    }
}
