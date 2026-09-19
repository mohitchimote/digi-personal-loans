package com.digibank.integration.dataverification.dto;

/** Wire shape matching application-service's dataverification.dto.DataVerificationRule exactly —
 * resolution is never set here (only application-service's DataVerificationService adds it later),
 * so it's omitted rather than duplicated. */
public class DataVerificationRule {

    private String ruleKey;
    private String section;
    private String applicationValue;
    private String documentValue;
    private String thirdPartyValue;
    private String status;

    public String getRuleKey() { return ruleKey; }
    public void setRuleKey(String ruleKey) { this.ruleKey = ruleKey; }

    public String getSection() { return section; }
    public void setSection(String section) { this.section = section; }

    public String getApplicationValue() { return applicationValue; }
    public void setApplicationValue(String applicationValue) { this.applicationValue = applicationValue; }

    public String getDocumentValue() { return documentValue; }
    public void setDocumentValue(String documentValue) { this.documentValue = documentValue; }

    public String getThirdPartyValue() { return thirdPartyValue; }
    public void setThirdPartyValue(String thirdPartyValue) { this.thirdPartyValue = thirdPartyValue; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
