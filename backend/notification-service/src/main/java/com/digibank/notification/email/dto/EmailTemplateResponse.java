package com.digibank.notification.email.dto;

import com.digibank.notification.email.EmailTemplate;

import java.util.List;

/** The persisted row merged with its event's static metadata — mirrors worker's
 * `{ ...row, ...EVENT_REGISTRY[row.eventKey] }` spread in admin-email-templates.ts. */
public class EmailTemplateResponse {
    private Long id;
    private String eventKey;
    private boolean enabled;
    private String toAddress;
    private String ccAddress;
    private String subject;
    private String headerContent;
    private String bodyContent;
    private String signature;
    private String footer;
    private String updatedAt;
    private String updatedBy;
    private String label;
    private String description;
    private List<EmailVariable> variables;

    public static EmailTemplateResponse of(EmailTemplate row, EmailEventMeta meta) {
        EmailTemplateResponse r = new EmailTemplateResponse();
        r.id = row.getId();
        r.eventKey = row.getEventKey();
        r.enabled = row.isEnabled();
        r.toAddress = row.getToAddress();
        r.ccAddress = row.getCcAddress();
        r.subject = row.getSubject();
        r.headerContent = row.getHeaderContent();
        r.bodyContent = row.getBodyContent();
        r.signature = row.getSignature();
        r.footer = row.getFooter();
        r.updatedAt = row.getUpdatedAt();
        r.updatedBy = row.getUpdatedBy();
        r.label = meta.label();
        r.description = meta.description();
        r.variables = meta.variables();
        return r;
    }

    public Long getId() { return id; }
    public String getEventKey() { return eventKey; }
    public boolean isEnabled() { return enabled; }
    public String getToAddress() { return toAddress; }
    public String getCcAddress() { return ccAddress; }
    public String getSubject() { return subject; }
    public String getHeaderContent() { return headerContent; }
    public String getBodyContent() { return bodyContent; }
    public String getSignature() { return signature; }
    public String getFooter() { return footer; }
    public String getUpdatedAt() { return updatedAt; }
    public String getUpdatedBy() { return updatedBy; }
    public String getLabel() { return label; }
    public String getDescription() { return description; }
    public List<EmailVariable> getVariables() { return variables; }
}
