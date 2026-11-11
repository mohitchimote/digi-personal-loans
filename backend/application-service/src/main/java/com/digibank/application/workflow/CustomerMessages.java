package com.digibank.application.workflow;

import com.digibank.application.client.DocumentClient;
import com.digibank.application.client.EmailClient;
import com.digibank.application.client.NotificationClient;
import com.digibank.application.client.NotificationText;
import com.digibank.application.model.LoanApplication;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * The customer-facing host effects of a workflow action (NOTIFY, EMAIL, GENERATE_DOC), run after the action has
 * committed. A definition names a template or event key; the wording lives here (port of the Worker's
 * lib/workflow/messages.ts, English only: this stack has no per-customer language yet). Every call is best
 * effort, never blocks or fails the decision it follows (the clients swallow delivery failures themselves).
 */
@Component
public class CustomerMessages {

    private final NotificationClient notifications;
    private final EmailClient emails;
    private final DocumentClient documents;
    private final NotificationText text;
    private final ObjectMapper mapper;

    public CustomerMessages(NotificationClient notifications, EmailClient emails, DocumentClient documents, NotificationText text, ObjectMapper mapper) {
        this.notifications = notifications;
        this.emails = emails;
        this.documents = documents;
        this.text = text;
        this.mapper = mapper;
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    private static boolean truthy(Object v) {
        return v != null && !Boolean.FALSE.equals(v) && !"".equals(v) && !"false".equalsIgnoreCase(String.valueOf(v));
    }

    /** A guarantor is newly needed only when the underwriter asked for one and none is on file. */
    static boolean guarantorNewlyNeeded(Map<String, Object> vars) {
        Object ask = vars.get("requireGuarantor");
        return (Boolean.TRUE.equals(ask) || "true".equalsIgnoreCase(str(ask))) && !truthy(vars.get("guarantorDetailsPresent"));
    }

    private static String guarantorNote(Map<String, Object> vars) {
        return guarantorNewlyNeeded(vars)
                ? " A guarantor is now required for this application — please complete the new Guarantor Details section, "
                  + "including a supporting document for your guarantor, before resubmitting."
                : "";
    }

    /** NOTIFY: an in-app notification for the customer. An unknown template sends nothing (as the Worker does). */
    public void notify(String template, LoanApplication app, Map<String, Object> vars) {
        String greeting = text.greeting(app);
        String purpose = text.loanPurpose(app);
        String title, message, type;
        switch (template) {
            case "DECISION_DECLINED" -> {
                title = "Update on Your Loan Application";
                type = "APPLICATION_UPDATE";
                message = greeting + " Thank you for applying for a personal loan for " + purpose + " with DigiBank. "
                        + "After careful review, we are unable to approve your application at this time.\n\n"
                        + "Reason: " + str(vars.get("reason")) + "\n\n"
                        + "Next steps: You're welcome to contact your DigiBank advisor for more detail, or reapply in the future "
                        + "if your circumstances change.";
            }
            case "SEND_BACK" -> {
                title = "Action Needed on Your Loan Application";
                type = "APPLICATION_UPDATE";
                message = greeting + " Thank you for applying for a personal loan for " + purpose + " with DigiBank. "
                        + "Our underwriting team has reviewed your application and sent it back for a few additional details "
                        + "before we can proceed.\n\n"
                        + "Underwriter's note: " + str(vars.get("reason")) + "\n\n"
                        + "Next steps: Please log in to your DigiBank portal, review the feedback on your application, "
                        + "update the relevant section(s), upload any supporting documents if requested, and resubmit "
                        + "for review." + guarantorNote(vars);
            }
            case "DECISION_APPROVED" -> {
                title = "Your Loan Application Has Been Approved!";
                type = "APPROVAL";
                message = greeting + " Congratulations! Your personal loan application for " + purpose
                        + " has been reviewed and approved by our underwriting team.\n\n"
                        + "Next steps: Please log in to your DigiBank portal to view your approval letter and loan agreement "
                        + "documents in the Documents section.";
            }
            case "DISBURSEMENT_AUTHORISED" -> {
                title = "Your Loan Funds Have Been Released";
                type = "APPROVAL";
                message = greeting + " Great news — your loan funds for " + purpose
                        + " have been authorised for release and will be transferred to your nominated account shortly.";
            }
            case "CLARIFICATION_REQUEST", "DOCUMENT_REQUEST" -> {
                boolean doc = "DOCUMENT_REQUEST".equals(template);
                title = doc ? "Document Required for Your Loan Application" : "Clarification Needed on Your Loan Application";
                type = "APPLICATION_UPDATE";
                message = greeting + " Thank you for applying for a personal loan for " + purpose + " with DigiBank. "
                        + "Our underwriting team is reviewing your " + text.sectionLabel(str(vars.get("section"))) + " details and needs "
                        + (doc ? "an additional document" : "some clarification") + " before we can proceed.\n\n"
                        + "Underwriter's note: " + str(vars.get("text")) + "\n\n"
                        + "Next steps: " + (doc
                            ? "Please log in to your DigiBank portal and upload the requested document from the Documents section."
                            : "Please log in to your DigiBank portal, review your application, and update the relevant section.")
                        + " Once done, your application will be back in the underwriting queue.";
            }
            default -> {
                return;
            }
        }
        notifications.send(app.getCustomerId(), title, message, type, app.getApplicationRef());
    }

    /** EMAIL: the admin-configured email for an event. The common variables every template gets, plus the event's own. */
    public void email(String event, LoanApplication app, Map<String, Object> vars) {
        Map<String, String> variables = text.commonEmailVariables(app);
        switch (event) {
            case "DECISION_APPROVED" -> {
                variables.put("approvedAmount", vars.get("approvedAmount") != null ? str(vars.get("approvedAmount")) : "");
                variables.put("reviewedBy", str(vars.get("reviewedBy")));
            }
            case "DECISION_DECLINED" -> {
                variables.put("declineReason", str(vars.get("declineReason")));
                variables.put("reviewedBy", str(vars.get("reviewedBy")));
            }
            case "SEND_BACK" -> {
                variables.put("sendBackReason", str(vars.get("sendBackReason")));
                variables.put("reviewedBy", str(vars.get("reviewedBy")));
                variables.put("guarantorRequiredNote", guarantorNote(vars));
            }
            case "DISBURSEMENT_AUTHORISED" -> variables.put("reviewedBy", str(vars.get("reviewedBy")));
            case "CLARIFICATION_REQUEST", "DOCUMENT_REQUEST" -> {
                variables.put("underwriterNote", str(vars.get("underwriterNote")));
                variables.put("sectionName", text.sectionLabel(str(vars.get("section"))));
            }
            default -> vars.forEach((k, v) -> variables.put(k, str(v)));
        }
        emails.send(event, app.getCustomerEmail(), variables);
    }

    private JsonNode json(String s) throws java.io.IOException {
        return s == null ? null : mapper.readTree(s);
    }

    /**
     * GENERATE_DOC: the final-approval offer letter, for the amount actually approved. Swallow-all: a document failure
     * must never block an underwriting decision. A business application's loan lives in companyDetails, not loanRequirements.
     */
    public void generateApprovalLetter(LoanApplication app) {
        try {
            boolean business = "BUSINESS".equals(app.getApplicationType());
            JsonNode product = json(app.getSelectedProductJson());
            JsonNode loan = json(business ? app.getCompanyDetailsJson() : app.getLoanRequirementsJson());
            if (product == null || loan == null) return;
            JsonNode personal = json(app.getPersonalDetailsJson());
            JsonNode company = json(app.getCompanyDetailsJson());
            String customerName = business
                    ? (company != null && company.hasNonNull("companyName") ? company.get("companyName").asText() : app.getCustomerEmail())
                    : personal != null ? (personal.path("firstName").asText("") + " " + personal.path("lastName").asText("")).trim() : app.getCustomerEmail();
            double approvedAmount = app.getApprovedAmount() != null ? app.getApprovedAmount().doubleValue() : loan.path("loanAmount").asDouble(0);
            double rate = product.hasNonNull("interestRate") ? product.get("interestRate").asDouble(0) : product.path("apr").asDouble(0);
            documents.generateFinalApprovalLetter(app.getApplicationRef(), app.getCustomerId(), customerName, approvedAmount,
                    product.path("productName").asText(""), rate, product.path("termMonths").asInt(0), product.path("monthlyRepayment").asDouble(0));
        } catch (Exception ignored) {
            // Document generation failure should never block an underwriting decision.
        }
    }
}
