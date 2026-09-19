package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.Email;

public class Applicant2PersonalDto {

    private String firstName;
    private String lastName;
    private String dateOfBirth;
    private String nationalId;
    private String idIssueDate;
    private String nationality;
    private String maritalStatus;
    private String relationshipToApplicant1;
    private String phoneNumber;

    @Email(message = "Must be a valid email address")
    private String email;

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
    public String getRelationshipToApplicant1() { return relationshipToApplicant1; }
    public void setRelationshipToApplicant1(String relationshipToApplicant1) { this.relationshipToApplicant1 = relationshipToApplicant1; }
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
}
