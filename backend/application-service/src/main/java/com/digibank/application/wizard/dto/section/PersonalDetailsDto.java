package com.digibank.application.wizard.dto.section;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public class PersonalDetailsDto {

    @NotBlank(message = "firstName is required")
    private String firstName;

    @NotBlank(message = "lastName is required")
    private String lastName;

    @NotBlank(message = "dateOfBirth is required")
    private String dateOfBirth;

    @NotBlank(message = "nationalId is required")
    private String nationalId;

    @NotBlank(message = "idIssueDate is required")
    private String idIssueDate;

    @NotBlank(message = "nationality is required")
    private String nationality;

    @NotBlank(message = "maritalStatus is required")
    private String maritalStatus;

    @NotNull(message = "dependents is required")
    @Min(value = 0, message = "dependents must be >= 0")
    private Integer dependents;

    private String phoneNumber;

    @Email(message = "Must be a valid email address")
    private String email;

    @NotBlank(message = "street is required")
    private String street;

    @NotBlank(message = "city is required")
    private String city;

    @NotBlank(message = "postCode is required")
    private String postCode;

    @NotBlank(message = "country is required")
    private String country;

    @Min(value = 0, message = "monthsAtCurrentAddress must be >= 0")
    private Integer monthsAtCurrentAddress;

    @NotNull(message = "previousAddresses is required")
    private List<@Valid AddressHistoryEntryDto> previousAddresses;

    private Boolean assistedByStaff;
    private String preferredBranch;
    private String staffName;

    @Valid
    private Applicant2PersonalDto applicant2;

    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }
    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }
    public String getDateOfBirth() { return dateOfBirth; }
    public void setDateOfBirth(String dateOfBirth) { this.dateOfBirth = dateOfBirth; }
    public String getNationalId() { return nationalId; }
    public void setNationalId(String nationalId) { this.nationalId = nationalId; }
    public String getIdIssueDate() { return idIssueDate; }
    public void setIdIssueDate(String idIssueDate) { this.idIssueDate = idIssueDate; }
    public String getNationality() { return nationality; }
    public void setNationality(String nationality) { this.nationality = nationality; }
    public String getMaritalStatus() { return maritalStatus; }
    public void setMaritalStatus(String maritalStatus) { this.maritalStatus = maritalStatus; }
    public Integer getDependents() { return dependents; }
    public void setDependents(Integer dependents) { this.dependents = dependents; }
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getStreet() { return street; }
    public void setStreet(String street) { this.street = street; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getPostCode() { return postCode; }
    public void setPostCode(String postCode) { this.postCode = postCode; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public Integer getMonthsAtCurrentAddress() { return monthsAtCurrentAddress; }
    public void setMonthsAtCurrentAddress(Integer monthsAtCurrentAddress) { this.monthsAtCurrentAddress = monthsAtCurrentAddress; }
    public List<AddressHistoryEntryDto> getPreviousAddresses() { return previousAddresses; }
    public void setPreviousAddresses(List<AddressHistoryEntryDto> previousAddresses) { this.previousAddresses = previousAddresses; }
    public Boolean getAssistedByStaff() { return assistedByStaff; }
    public void setAssistedByStaff(Boolean assistedByStaff) { this.assistedByStaff = assistedByStaff; }
    public String getPreferredBranch() { return preferredBranch; }
    public void setPreferredBranch(String preferredBranch) { this.preferredBranch = preferredBranch; }
    public String getStaffName() { return staffName; }
    public void setStaffName(String staffName) { this.staffName = staffName; }
    public Applicant2PersonalDto getApplicant2() { return applicant2; }
    public void setApplicant2(Applicant2PersonalDto applicant2) { this.applicant2 = applicant2; }
}
