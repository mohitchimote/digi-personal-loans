package com.digibank.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;

import java.time.LocalDate;

public class RegisterRequest {

    @NotBlank(message = "Email is required")
    @Email(message = "Must be a valid email address")
    private String email;

    @NotBlank(message = "National ID is required")
    @Pattern(regexp = "\\d{9}", message = "National ID must be 9 digits")
    private String nationalId;

    @NotNull(message = "ID issue date is required")
    @Past(message = "ID issue date must be in the past")
    private LocalDate idIssueDate;

    @NotBlank(message = "Full name is required")
    private String fullName;

    private String phoneNumber;

    /** "PERSONAL" (default) or "BUSINESS". When BUSINESS, the four company fields below are
     * required (validated in AuthService, not via annotations here, so the personal path's
     * existing optionality is untouched). */
    private String accountType = "PERSONAL";

    private String companyName;
    private String companyRegistrationNumber;
    private String companyIndustry;
    private Integer companyFoundedYear;

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
    public String getAccountType() { return accountType; }
    public void setAccountType(String accountType) { this.accountType = accountType; }
    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }
    public String getCompanyRegistrationNumber() { return companyRegistrationNumber; }
    public void setCompanyRegistrationNumber(String companyRegistrationNumber) { this.companyRegistrationNumber = companyRegistrationNumber; }
    public String getCompanyIndustry() { return companyIndustry; }
    public void setCompanyIndustry(String companyIndustry) { this.companyIndustry = companyIndustry; }
    public Integer getCompanyFoundedYear() { return companyFoundedYear; }
    public void setCompanyFoundedYear(Integer companyFoundedYear) { this.companyFoundedYear = companyFoundedYear; }
}
