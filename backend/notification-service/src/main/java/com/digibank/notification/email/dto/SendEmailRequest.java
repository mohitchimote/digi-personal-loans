package com.digibank.notification.email.dto;

import java.util.Map;

/** Internal service-to-service contract: application-service already knows applicantName,
 * applicationRef, loanPurpose and any event-specific extras (it owns the LoanApplication data),
 * so it computes the full variable map itself and hands it here — mirrors how NotificationClient
 * already works (caller builds the message, notification-service just delivers it). */
public class SendEmailRequest {
    private String eventKey;
    private String customerEmail;
    private Map<String, String> variables;

    public String getEventKey() { return eventKey; }
    public void setEventKey(String eventKey) { this.eventKey = eventKey; }

    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }

    public Map<String, String> getVariables() { return variables; }
    public void setVariables(Map<String, String> variables) { this.variables = variables; }
}
