package com.digibank.integration.dataverification.dto;

import java.util.List;

/** Wire shape matching application-service's dataverification.dto.DataVerificationSummary exactly. */
public class DataVerificationSummary {

    private String generatedAt;
    private String seed;
    private List<DataVerificationRule> rules;

    public String getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(String generatedAt) { this.generatedAt = generatedAt; }

    public String getSeed() { return seed; }
    public void setSeed(String seed) { this.seed = seed; }

    public List<DataVerificationRule> getRules() { return rules; }
    public void setRules(List<DataVerificationRule> rules) { this.rules = rules; }
}
