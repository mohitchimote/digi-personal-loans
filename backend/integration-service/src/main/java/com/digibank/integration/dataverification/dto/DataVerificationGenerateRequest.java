package com.digibank.integration.dataverification.dto;

/** Everything DataVerificationGenerator needs, extracted from the caller's LoanApplication —
 * this service holds no LoanApplication entity/table of its own. */
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
