package com.digibank.application.dataverification.dto;

/** Outbound request shape to integration-service's POST /internal/integration/data-verification
 * /generate — everything the generator needs, extracted from LoanApplication (integration-service
 * holds no LoanApplication entity/table of its own). */
public class DataVerificationGenerateRequest {

    private String applicationRef;
    private String personalDetailsJson;
    private String incomeEmploymentJson;
    private String creditDeclarationsJson;

    public String getApplicationRef() { return applicationRef; }
    public void setApplicationRef(String applicationRef) { this.applicationRef = applicationRef; }

    public String getPersonalDetailsJson() { return personalDetailsJson; }
    public void setPersonalDetailsJson(String personalDetailsJson) { this.personalDetailsJson = personalDetailsJson; }

    public String getIncomeEmploymentJson() { return incomeEmploymentJson; }
    public void setIncomeEmploymentJson(String incomeEmploymentJson) { this.incomeEmploymentJson = incomeEmploymentJson; }

    public String getCreditDeclarationsJson() { return creditDeclarationsJson; }
    public void setCreditDeclarationsJson(String creditDeclarationsJson) { this.creditDeclarationsJson = creditDeclarationsJson; }
}
