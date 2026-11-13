package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class ReviewSubmitDto {

    @NotNull(message = "agreedToTerms is required")
    @AssertTrue(message = "agreedToTerms must be true")
    private Boolean agreedToTerms;

    @NotNull(message = "agreedToPrivacy is required")
    @AssertTrue(message = "agreedToPrivacy must be true")
    private Boolean agreedToPrivacy;

    @NotNull(message = "agreedToCredit is required")
    @AssertTrue(message = "agreedToCredit must be true")
    private Boolean agreedToCredit;

    @NotBlank(message = "signature is required")
    @Size(min = 2, message = "signature must be at least 2 characters")
    private String signature;

    public Boolean getAgreedToTerms() { return agreedToTerms; }
    public void setAgreedToTerms(Boolean agreedToTerms) { this.agreedToTerms = agreedToTerms; }
    public Boolean getAgreedToPrivacy() { return agreedToPrivacy; }
    public void setAgreedToPrivacy(Boolean agreedToPrivacy) { this.agreedToPrivacy = agreedToPrivacy; }
    public Boolean getAgreedToCredit() { return agreedToCredit; }
    public void setAgreedToCredit(Boolean agreedToCredit) { this.agreedToCredit = agreedToCredit; }
    public String getSignature() { return signature; }
    public void setSignature(String signature) { this.signature = signature; }
}
