package com.digibank.application.dto;

import java.util.List;

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
