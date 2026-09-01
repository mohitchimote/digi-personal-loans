package com.digibank.notification.email;

import jakarta.persistence.*;

/**
 * Email context (ARCHITECTURE.md §10) — admin-configurable per-lifecycle-event templates plus
 * Resend delivery. Ports worker's emailTemplates table (worker/src/db/schema.ts) exactly.
 */
@Entity
@Table(name = "email_templates")
public class EmailTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_key", nullable = false, unique = true)
    private String eventKey;

    @Column(nullable = false)
    private boolean enabled = false;

    private String toAddress;
    private String ccAddress;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String subject = "";

    @Column(columnDefinition = "TEXT")
    private String headerContent;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String bodyContent = "";

    @Column(columnDefinition = "TEXT")
    private String signature;

    @Column(columnDefinition = "TEXT")
    private String footer;

    private String updatedAt;
    private String updatedBy;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getEventKey() { return eventKey; }
    public void setEventKey(String eventKey) { this.eventKey = eventKey; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public String getToAddress() { return toAddress; }
    public void setToAddress(String toAddress) { this.toAddress = toAddress; }

    public String getCcAddress() { return ccAddress; }
    public void setCcAddress(String ccAddress) { this.ccAddress = ccAddress; }

    public String getSubject() { return subject; }
    public void setSubject(String subject) { this.subject = subject; }

    public String getHeaderContent() { return headerContent; }
    public void setHeaderContent(String headerContent) { this.headerContent = headerContent; }

    public String getBodyContent() { return bodyContent; }
    public void setBodyContent(String bodyContent) { this.bodyContent = bodyContent; }

    public String getSignature() { return signature; }
    public void setSignature(String signature) { this.signature = signature; }

    public String getFooter() { return footer; }
    public void setFooter(String footer) { this.footer = footer; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
}
