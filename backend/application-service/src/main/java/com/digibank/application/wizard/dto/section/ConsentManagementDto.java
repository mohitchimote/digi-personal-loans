package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.NotNull;

public class ConsentManagementDto {

    @NotNull(message = "creditBureauConsent is required")
    private Boolean creditBureauConsent;

    @NotNull(message = "pepScreeningConsent is required")
    private Boolean pepScreeningConsent;

    @NotNull(message = "sanctionsScreeningConsent is required")
    private Boolean sanctionsScreeningConsent;

    @NotNull(message = "dataProcessingConsent is required")
    private Boolean dataProcessingConsent;

    private String consentTimestamp;
    private String consentMethod;

    public Boolean getCreditBureauConsent() { return creditBureauConsent; }
    public void setCreditBureauConsent(Boolean creditBureauConsent) { this.creditBureauConsent = creditBureauConsent; }
    public Boolean getPepScreeningConsent() { return pepScreeningConsent; }
    public void setPepScreeningConsent(Boolean pepScreeningConsent) { this.pepScreeningConsent = pepScreeningConsent; }
    public Boolean getSanctionsScreeningConsent() { return sanctionsScreeningConsent; }
    public void setSanctionsScreeningConsent(Boolean sanctionsScreeningConsent) { this.sanctionsScreeningConsent = sanctionsScreeningConsent; }
    public Boolean getDataProcessingConsent() { return dataProcessingConsent; }
    public void setDataProcessingConsent(Boolean dataProcessingConsent) { this.dataProcessingConsent = dataProcessingConsent; }
    public String getConsentTimestamp() { return consentTimestamp; }
    public void setConsentTimestamp(String consentTimestamp) { this.consentTimestamp = consentTimestamp; }
    public String getConsentMethod() { return consentMethod; }
    public void setConsentMethod(String consentMethod) { this.consentMethod = consentMethod; }
}
