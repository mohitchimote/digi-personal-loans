package com.digibank.notification.email.dto;

/** Mirrors worker's upsertSchema (routes/admin-email-templates.ts). */
public class UpsertEmailTemplateRequest {
    private boolean enabled;
    private String toAddress;
    private String ccAddress;
    private String subject;
    private String headerContent;
    private String bodyContent;
    private String signature;
    private String footer;

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
}
