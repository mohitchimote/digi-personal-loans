package com.digibank.application.model;

import jakarta.persistence.*;

/**
 * One referral of a case up the approval ladder (the Worker's case_referrals table). Read here so the
 * Decision tab's referral history works; rows are written by the workflow engine's refer action, which
 * is not part of this service yet. Timestamps are ISO-8601 strings, as the Worker serves them.
 */
@Entity
@Table(name = "case_referrals")
public class CaseReferral {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String applicationRef;

    @Column(nullable = false)
    private String fromRole;

    @Column(nullable = false)
    private Long fromUserId;

    @Column(nullable = false)
    private String fromName;

    @Column(nullable = false)
    private String toRole;

    @Column(columnDefinition = "TEXT")
    private String reason;

    @Column(nullable = false)
    private String createdAt;

    private String resolvedAt;

    public CaseReferral() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getApplicationRef() { return applicationRef; }
    public void setApplicationRef(String applicationRef) { this.applicationRef = applicationRef; }
    public String getFromRole() { return fromRole; }
    public void setFromRole(String fromRole) { this.fromRole = fromRole; }
    public Long getFromUserId() { return fromUserId; }
    public void setFromUserId(Long fromUserId) { this.fromUserId = fromUserId; }
    public String getFromName() { return fromName; }
    public void setFromName(String fromName) { this.fromName = fromName; }
    public String getToRole() { return toRole; }
    public void setToRole(String toRole) { this.toRole = toRole; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(String resolvedAt) { this.resolvedAt = resolvedAt; }
}
