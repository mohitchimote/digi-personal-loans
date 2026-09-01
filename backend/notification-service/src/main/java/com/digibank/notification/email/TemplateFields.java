package com.digibank.notification.email;

/** Just the fields that get rendered — shared shape between a persisted EmailTemplate and a
 * preview/test draft merged over one (see EmailTemplateAdminService). */
public record TemplateFields(String subject, String headerContent, String bodyContent, String signature, String footer) {
}
