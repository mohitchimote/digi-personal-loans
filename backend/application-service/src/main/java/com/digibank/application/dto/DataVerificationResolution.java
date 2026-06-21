package com.digibank.application.dto;

public class DataVerificationResolution {

    private String action;
    private String note;
    private String reviewedBy;
    private String resolvedAt;

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public String getReviewedBy() { return reviewedBy; }
    public void setReviewedBy(String reviewedBy) { this.reviewedBy = reviewedBy; }

    public String getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(String resolvedAt) { this.resolvedAt = resolvedAt; }
}
