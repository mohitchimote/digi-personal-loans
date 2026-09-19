package com.digibank.application.wizard.dto.section;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public class ConnectBankDto {

    @NotNull(message = "connected is required")
    private Boolean connected;

    private String bankName;

    @Valid
    private BankSummaryDto summary;

    private List<@Valid ConnectedAccountDto> accounts;

    private String primaryAccountId;
    private Boolean skipped;

    @Valid
    private ConnectBankApplicant2Dto applicant2;

    public Boolean getConnected() { return connected; }
    public void setConnected(Boolean connected) { this.connected = connected; }
    public String getBankName() { return bankName; }
    public void setBankName(String bankName) { this.bankName = bankName; }
    public BankSummaryDto getSummary() { return summary; }
    public void setSummary(BankSummaryDto summary) { this.summary = summary; }
    public List<ConnectedAccountDto> getAccounts() { return accounts; }
    public void setAccounts(List<ConnectedAccountDto> accounts) { this.accounts = accounts; }
    public String getPrimaryAccountId() { return primaryAccountId; }
    public void setPrimaryAccountId(String primaryAccountId) { this.primaryAccountId = primaryAccountId; }
    public Boolean getSkipped() { return skipped; }
    public void setSkipped(Boolean skipped) { this.skipped = skipped; }
    public ConnectBankApplicant2Dto getApplicant2() { return applicant2; }
    public void setApplicant2(ConnectBankApplicant2Dto applicant2) { this.applicant2 = applicant2; }
}
