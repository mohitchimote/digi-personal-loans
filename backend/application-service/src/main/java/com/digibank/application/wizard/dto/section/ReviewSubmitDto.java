package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class ReviewSubmitDto {

    @NotNull(message = "agreedToTerms is required")
    @AssertTrue(message = "agreedToTerms must be true")
    private Boolean agreedToTerms;

    @NotNull(message = "agreedToPrivacyPolicy is required")
    @AssertTrue(message = "agreedToPrivacyPolicy must be true")
    private Boolean agreedToPrivacyPolicy;

    @NotBlank(message = "electronicSignature is required")
    @Size(min = 2, message = "electronicSignature must be at least 2 characters")
    private String electronicSignature;

    @NotBlank(message = "submittedAt is required")
    private String submittedAt;

    public Boolean getAgreedToTerms() { return agreedToTerms; }
    public void setAgreedToTerms(Boolean agreedToTerms) { this.agreedToTerms = agreedToTerms; }
    public Boolean getAgreedToPrivacyPolicy() { return agreedToPrivacyPolicy; }
    public void setAgreedToPrivacyPolicy(Boolean agreedToPrivacyPolicy) { this.agreedToPrivacyPolicy = agreedToPrivacyPolicy; }
    public String getElectronicSignature() { return electronicSignature; }
    public void setElectronicSignature(String electronicSignature) { this.electronicSignature = electronicSignature; }
    public String getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(String submittedAt) { this.submittedAt = submittedAt; }
}
