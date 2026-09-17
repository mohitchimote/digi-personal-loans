package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;

import java.util.List;

public class GuarantorDetailsDto {

    @NotBlank(message = "guarantorName is required")
    private String guarantorName;

    @NotBlank(message = "guarantorNationalId is required")
    @Pattern(regexp = "\\d{9}", message = "guarantorNationalId must be 9 digits")
    private String guarantorNationalId;

    @NotBlank(message = "guarantorRelationship is required")
    private String guarantorRelationship;

    @NotBlank(message = "guarantorPhone is required")
    private String guarantorPhone;

    @NotBlank(message = "guarantorEmail is required")
    @Email(message = "Must be a valid email address")
    private String guarantorEmail;

    @NotEmpty(message = "files must contain at least one entry")
    private List<String> files;

    public String getGuarantorName() { return guarantorName; }
    public void setGuarantorName(String guarantorName) { this.guarantorName = guarantorName; }
    public String getGuarantorNationalId() { return guarantorNationalId; }
    public void setGuarantorNationalId(String guarantorNationalId) { this.guarantorNationalId = guarantorNationalId; }
    public String getGuarantorRelationship() { return guarantorRelationship; }
    public void setGuarantorRelationship(String guarantorRelationship) { this.guarantorRelationship = guarantorRelationship; }
    public String getGuarantorPhone() { return guarantorPhone; }
    public void setGuarantorPhone(String guarantorPhone) { this.guarantorPhone = guarantorPhone; }
    public String getGuarantorEmail() { return guarantorEmail; }
    public void setGuarantorEmail(String guarantorEmail) { this.guarantorEmail = guarantorEmail; }
    public List<String> getFiles() { return files; }
    public void setFiles(List<String> files) { this.files = files; }
}
