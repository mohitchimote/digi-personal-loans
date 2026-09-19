package com.digibank.application.businessfinancials.dto;

/** Outbound request shape to integration-service's POST /internal/integration/business-financials
 * /generate — everything the generator needs, extracted from LoanApplication (integration-service
 * holds no LoanApplication entity/table of its own). */
public class BusinessFinancialsGenerateRequest {

    private String applicationRef;
    private String businessFinancialsJson;
    private String businessCreditDeclarationsJson;
    private String affordabilityResultJson;

    public String getApplicationRef() { return applicationRef; }
    public void setApplicationRef(String applicationRef) { this.applicationRef = applicationRef; }

    public String getBusinessFinancialsJson() { return businessFinancialsJson; }
    public void setBusinessFinancialsJson(String businessFinancialsJson) { this.businessFinancialsJson = businessFinancialsJson; }

    public String getBusinessCreditDeclarationsJson() { return businessCreditDeclarationsJson; }
    public void setBusinessCreditDeclarationsJson(String businessCreditDeclarationsJson) { this.businessCreditDeclarationsJson = businessCreditDeclarationsJson; }

    public String getAffordabilityResultJson() { return affordabilityResultJson; }
    public void setAffordabilityResultJson(String affordabilityResultJson) { this.affordabilityResultJson = affordabilityResultJson; }
}
