package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class BusinessBankSummaryDto {

    @NotBlank(message = "accountMasked is required")
    private String accountMasked;

    @NotNull(message = "avgBalance is required")
    private Double avgBalance;

    @NotNull(message = "transactions is required")
    private Integer transactions;

    public String getAccountMasked() { return accountMasked; }
    public void setAccountMasked(String accountMasked) { this.accountMasked = accountMasked; }
    public Double getAvgBalance() { return avgBalance; }
    public void setAvgBalance(Double avgBalance) { this.avgBalance = avgBalance; }
    public Integer getTransactions() { return transactions; }
    public void setTransactions(Integer transactions) { this.transactions = transactions; }
}
