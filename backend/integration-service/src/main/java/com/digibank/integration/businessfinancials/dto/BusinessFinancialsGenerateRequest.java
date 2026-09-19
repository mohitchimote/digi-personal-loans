package com.digibank.integration.businessfinancials.dto;

/** Everything BusinessFinancialsGenerator needs, extracted from the caller's LoanApplication —
 * this service holds no LoanApplication entity/table of its own. */
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
