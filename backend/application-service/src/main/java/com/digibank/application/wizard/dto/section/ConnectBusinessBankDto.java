package com.digibank.application.wizard.dto.section;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public class ConnectBusinessBankDto {

    @NotNull(message = "connected is required")
    private Boolean connected;

    private String bankId;
    private String bankName;

    @Valid
    private BusinessBankSummaryDto summary;

    private Boolean skipped;

    public Boolean getConnected() { return connected; }
    public void setConnected(Boolean connected) { this.connected = connected; }
    public String getBankId() { return bankId; }
    public void setBankId(String bankId) { this.bankId = bankId; }
    public String getBankName() { return bankName; }
    public void setBankName(String bankName) { this.bankName = bankName; }
    public BusinessBankSummaryDto getSummary() { return summary; }
    public void setSummary(BusinessBankSummaryDto summary) { this.summary = summary; }
    public Boolean getSkipped() { return skipped; }
    public void setSkipped(Boolean skipped) { this.skipped = skipped; }
}
