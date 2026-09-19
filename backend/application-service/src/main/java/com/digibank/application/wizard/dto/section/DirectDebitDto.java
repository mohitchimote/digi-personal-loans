package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public class DirectDebitDto {

    @Pattern(regexp = "applicant1|applicant2|manual", message = "accountSource must be applicant1, applicant2 or manual")
    private String accountSource;

    @NotBlank(message = "accountHolderName is required")
    private String accountHolderName;

    @NotBlank(message = "bankCode is required")
    private String bankCode;

    @NotBlank(message = "branchCode is required")
    private String branchCode;

    @NotBlank(message = "accountNumber is required")
    private String accountNumber;

    @NotNull(message = "preferredRepaymentDay is required")
    @Min(value = 1, message = "preferredRepaymentDay must be >= 1")
    @Max(value = 28, message = "preferredRepaymentDay must be <= 28")
    private Integer preferredRepaymentDay;

    @NotNull(message = "confirmAuthorisation is required")
    @AssertTrue(message = "confirmAuthorisation must be true")
    private Boolean confirmAuthorisation;

    private String bankName;
    private String branchName;

    public String getAccountSource() { return accountSource; }
    public void setAccountSource(String accountSource) { this.accountSource = accountSource; }
    public String getAccountHolderName() { return accountHolderName; }
    public void setAccountHolderName(String accountHolderName) { this.accountHolderName = accountHolderName; }
    public String getBankCode() { return bankCode; }
    public void setBankCode(String bankCode) { this.bankCode = bankCode; }
    public String getBranchCode() { return branchCode; }
    public void setBranchCode(String branchCode) { this.branchCode = branchCode; }
    public String getAccountNumber() { return accountNumber; }
    public void setAccountNumber(String accountNumber) { this.accountNumber = accountNumber; }
    public Integer getPreferredRepaymentDay() { return preferredRepaymentDay; }
    public void setPreferredRepaymentDay(Integer preferredRepaymentDay) { this.preferredRepaymentDay = preferredRepaymentDay; }
    public Boolean getConfirmAuthorisation() { return confirmAuthorisation; }
    public void setConfirmAuthorisation(Boolean confirmAuthorisation) { this.confirmAuthorisation = confirmAuthorisation; }
    public String getBankName() { return bankName; }
    public void setBankName(String bankName) { this.bankName = bankName; }
    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
}
