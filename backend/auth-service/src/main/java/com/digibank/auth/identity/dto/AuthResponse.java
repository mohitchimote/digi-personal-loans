package com.digibank.auth.identity.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class AuthResponse {
    private String token;
    private String tokenType = "Bearer";
    private Long userId;
    private String email;
    private String nationalId;
    private LocalDate idIssueDate;
    private String fullName;
    private String phoneNumber;
    private String role;
    private String roleLabel;
    private List<String> entitlements = List.of();
    private String scope = "ALL";
    private long expiresIn;
    private String companyName;
    private String companyRegistrationNumber;
    private String companyIndustry;
    private Integer companyFoundedYear;
    private LocalDateTime previousLogin;

    public AuthResponse() {}

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getTokenType() { return tokenType; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
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
    public String getRoleLabel() { return roleLabel; }
    public void setRoleLabel(String roleLabel) { this.roleLabel = roleLabel; }
    public List<String> getEntitlements() { return entitlements; }
    public void setEntitlements(List<String> entitlements) { this.entitlements = entitlements; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public long getExpiresIn() { return expiresIn; }
    public void setExpiresIn(long expiresIn) { this.expiresIn = expiresIn; }
    public String getCompanyRegistrationNumber() { return companyRegistrationNumber; }
    public void setCompanyRegistrationNumber(String v) { this.companyRegistrationNumber = v; }
    public String getCompanyIndustry() { return companyIndustry; }
    public void setCompanyIndustry(String v) { this.companyIndustry = v; }
    public Integer getCompanyFoundedYear() { return companyFoundedYear; }
    public void setCompanyFoundedYear(Integer v) { this.companyFoundedYear = v; }
    public LocalDateTime getPreviousLogin() { return previousLogin; }
    public void setPreviousLogin(LocalDateTime v) { this.previousLogin = v; }
    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final AuthResponse r = new AuthResponse();
        public Builder token(String v) { r.token = v; return this; }
        public Builder tokenType(String v) { r.tokenType = v; return this; }
        public Builder userId(Long v) { r.userId = v; return this; }
        public Builder email(String v) { r.email = v; return this; }
        public Builder nationalId(String v) { r.nationalId = v; return this; }
        public Builder idIssueDate(LocalDate v) { r.idIssueDate = v; return this; }
        public Builder fullName(String v) { r.fullName = v; return this; }
        public Builder phoneNumber(String v) { r.phoneNumber = v; return this; }
        public Builder role(String v) { r.role = v; return this; }
        public Builder roleLabel(String v) { r.roleLabel = v; return this; }
        public Builder entitlements(List<String> v) { r.entitlements = v; return this; }
        public Builder scope(String v) { r.scope = v; return this; }
        public Builder expiresIn(long v) { r.expiresIn = v; return this; }
        public Builder companyName(String v) { r.companyName = v; return this; }
        public Builder companyRegistrationNumber(String v) { r.companyRegistrationNumber = v; return this; }
        public Builder companyIndustry(String v) { r.companyIndustry = v; return this; }
        public Builder companyFoundedYear(Integer v) { r.companyFoundedYear = v; return this; }
        public AuthResponse build() { return r; }
    }
}
