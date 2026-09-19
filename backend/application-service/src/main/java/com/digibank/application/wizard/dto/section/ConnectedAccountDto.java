package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class ConnectedAccountDto {

    @NotBlank(message = "id is required")
    private String id;

    @NotBlank(message = "bankName is required")
    private String bankName;

    @NotBlank(message = "accountMasked is required")
    private String accountMasked;

    private Double avgBalance;
    private Integer transactions;

    @NotNull(message = "manual is required")
    private Boolean manual;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getBankName() { return bankName; }
    public void setBankName(String bankName) { this.bankName = bankName; }
    public String getAccountMasked() { return accountMasked; }
    public void setAccountMasked(String accountMasked) { this.accountMasked = accountMasked; }
    public Double getAvgBalance() { return avgBalance; }
    public void setAvgBalance(Double avgBalance) { this.avgBalance = avgBalance; }
    public Integer getTransactions() { return transactions; }
    public void setTransactions(Integer transactions) { this.transactions = transactions; }
    public Boolean getManual() { return manual; }
    public void setManual(Boolean manual) { this.manual = manual; }
}
