package com.digibank.notification.email.dto;

/** Mirrors worker's draftFieldsSchema — draft fields sent for /preview and /test, all optional
 * (missing ones fall back to the persisted row). */
public class EmailTemplateDraft {
    private String subject;
    private String headerContent;
    private String bodyContent;
    private String signature;
    private String footer;
    private String ccAddress;

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

    public String getCcAddress() { return ccAddress; }
    public void setCcAddress(String ccAddress) { this.ccAddress = ccAddress; }
}
