package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class LoanRequirementsDto {

    @NotNull(message = "loanAmount is required")
    @DecimalMin(value = "5000", message = "loanAmount must be >= 5000")
    @DecimalMax(value = "300000", message = "loanAmount must be <= 300000")
    private Double loanAmount;

    @NotBlank(message = "loanPurpose is required")
    private String loanPurpose;

    @NotNull(message = "loanTerm is required")
    @DecimalMin(value = "6", message = "loanTerm must be >= 6")
    @DecimalMax(value = "84", message = "loanTerm must be <= 84")
    private Integer loanTerm;

    @NotNull(message = "numberOfApplicants is required")
    private Integer numberOfApplicants;

    public Double getLoanAmount() { return loanAmount; }
    public void setLoanAmount(Double loanAmount) { this.loanAmount = loanAmount; }
    public String getLoanPurpose() { return loanPurpose; }
    public void setLoanPurpose(String loanPurpose) { this.loanPurpose = loanPurpose; }
    public Integer getLoanTerm() { return loanTerm; }
    public void setLoanTerm(Integer loanTerm) { this.loanTerm = loanTerm; }
    public Integer getNumberOfApplicants() { return numberOfApplicants; }
    public void setNumberOfApplicants(Integer numberOfApplicants) { this.numberOfApplicants = numberOfApplicants; }
}
