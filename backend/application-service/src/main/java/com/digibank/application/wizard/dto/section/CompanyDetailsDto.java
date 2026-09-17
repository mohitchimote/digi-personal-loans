package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class CompanyDetailsDto {

    @NotBlank(message = "companyName is required")
    private String companyName;

    @NotBlank(message = "companyRegistrationNumber is required")
    private String companyRegistrationNumber;

    @NotBlank(message = "industry is required")
    private String industry;

    @NotNull(message = "yearFounded is required")
    private Integer yearFounded;

    @NotBlank(message = "street is required")
    private String street;

    @NotBlank(message = "city is required")
    private String city;

    @NotBlank(message = "postCode is required")
    private String postCode;

    @NotBlank(message = "country is required")
    private String country;

    @NotNull(message = "loanAmount is required")
    @DecimalMin(value = "20000", message = "loanAmount must be >= 20000")
    @DecimalMax(value = "1000000", message = "loanAmount must be <= 1000000")
    private Double loanAmount;

    @NotBlank(message = "loanPurpose is required")
    private String loanPurpose;

    @NotNull(message = "loanTerm is required")
    @DecimalMin(value = "6", message = "loanTerm must be >= 6")
    @DecimalMax(value = "84", message = "loanTerm must be <= 84")
    private Integer loanTerm;

    private Boolean assistedByStaff;
    private String preferredBranch;
    private String staffName;

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }
    public String getCompanyRegistrationNumber() { return companyRegistrationNumber; }
    public void setCompanyRegistrationNumber(String companyRegistrationNumber) { this.companyRegistrationNumber = companyRegistrationNumber; }
    public String getIndustry() { return industry; }
    public void setIndustry(String industry) { this.industry = industry; }
    public Integer getYearFounded() { return yearFounded; }
    public void setYearFounded(Integer yearFounded) { this.yearFounded = yearFounded; }
    public String getStreet() { return street; }
    public void setStreet(String street) { this.street = street; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getPostCode() { return postCode; }
    public void setPostCode(String postCode) { this.postCode = postCode; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public Double getLoanAmount() { return loanAmount; }
    public void setLoanAmount(Double loanAmount) { this.loanAmount = loanAmount; }
    public String getLoanPurpose() { return loanPurpose; }
    public void setLoanPurpose(String loanPurpose) { this.loanPurpose = loanPurpose; }
    public Integer getLoanTerm() { return loanTerm; }
    public void setLoanTerm(Integer loanTerm) { this.loanTerm = loanTerm; }
    public Boolean getAssistedByStaff() { return assistedByStaff; }
    public void setAssistedByStaff(Boolean assistedByStaff) { this.assistedByStaff = assistedByStaff; }
    public String getPreferredBranch() { return preferredBranch; }
    public void setPreferredBranch(String preferredBranch) { this.preferredBranch = preferredBranch; }
    public String getStaffName() { return staffName; }
    public void setStaffName(String staffName) { this.staffName = staffName; }
}
