package com.digibank.application.dto;

public class DataVerificationRule {

    private String ruleKey;
    private String section;
    private String applicationValue;
    private String documentValue;
    private String thirdPartyValue;
    private String status;
    private DataVerificationResolution resolution;

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

    public DataVerificationResolution getResolution() { return resolution; }
    public void setResolution(DataVerificationResolution resolution) { this.resolution = resolution; }
}
