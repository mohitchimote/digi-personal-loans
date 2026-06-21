package com.digibank.application.dto;

import jakarta.validation.constraints.NotBlank;

public class DataVerificationResolutionRequest {

    @NotBlank(message = "Rule key is required")
    private String ruleKey;

    @NotBlank(message = "Action is required")
    private String action;

    private String note;

    @NotBlank(message = "Reviewed by is required")
    private String reviewedBy;

    public String getRuleKey() { return ruleKey; }
    public void setRuleKey(String ruleKey) { this.ruleKey = ruleKey; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public String getReviewedBy() { return reviewedBy; }
    public void setReviewedBy(String reviewedBy) { this.reviewedBy = reviewedBy; }
}
