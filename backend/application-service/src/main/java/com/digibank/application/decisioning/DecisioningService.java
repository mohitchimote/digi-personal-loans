package com.digibank.application.decisioning;

import com.digibank.application.audittrail.AuditTrailService;
import com.digibank.application.client.AffordabilityClient;
import com.digibank.application.client.DocumentClient;
import com.digibank.application.client.EmailClient;
import com.digibank.application.client.NotificationClient;
import com.digibank.application.client.NotificationText;
import com.digibank.application.client.RuleServiceClient;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Decisioning & mandates context (ARCHITECTURE.md §10) — approve/decline/refer/disbursement, plus
 * server-side mandate-limit enforcement (PRODUCTION_READINESS.md §5). Depends on AuditTrailService
 * for the audit-note side effect every decision leaves; the wizard context calls into this one
 * (maybeAutoApprove) rather than the other way around — see WizardService.selectProduct.
 */
@Service
public class DecisioningService {

    private final LoanApplicationRepository repository;
    private final ObjectMapper objectMapper;
    private final NotificationClient notificationClient;
    private final DocumentClient documentClient;
    private final AffordabilityClient affordabilityClient;
    private final AuditTrailService auditTrailService;
    private final NotificationText text;
    private final RuleServiceClient ruleServiceClient;
    private final EmailClient emailClient;

    private static final List<String> PIPELINE_STATUSES = List.of(
            "SUBMITTED", "UNDER_REVIEW", "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR", "APPROVED");

    private static final List<String> BANKER_QUEUE_STATUSES = List.of(
            "DRAFT", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW",
            "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR", "APPROVED");

    public DecisioningService(LoanApplicationRepository repository, ObjectMapper objectMapper,
                               NotificationClient notificationClient, DocumentClient documentClient,
                               AffordabilityClient affordabilityClient, AuditTrailService auditTrailService,
                               NotificationText text, RuleServiceClient ruleServiceClient, EmailClient emailClient) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.notificationClient = notificationClient;
        this.documentClient = documentClient;
        this.affordabilityClient = affordabilityClient;
        this.auditTrailService = auditTrailService;
        this.text = text;
        this.ruleServiceClient = ruleServiceClient;
        this.emailClient = emailClient;
    }

    public List<LoanApplication> getPipeline() {
        return repository.findByStatusInOrderBySubmittedAtAsc(PIPELINE_STATUSES);
    }

    /** Queue for the Banker role — all live applications from draft through to final approval. */
    public List<LoanApplication> getBankerQueue() {
        return repository.findByStatusInOrderByUpdatedAtDesc(BANKER_QUEUE_STATUSES);
    }

    @Transactional
    public LoanApplication declineApplication(String appRef, String reason, String reviewedBy) {
        LoanApplication app = getByRef(appRef);
        app.setStatus("DECLINED");
        repository.save(app);
        auditTrailService.addNote(appRef, "general", reason, "DECISION_DECLINED", reviewedBy);

        notificationClient.send(app.getCustomerId(), "Update on Your Loan Application",
                text.greeting(app) + " Thank you for applying for a personal loan for " + text.loanPurpose(app) + " with DigiBank. "
                        + "After careful review, we are unable to approve your application at this time.\n\n"
                        + "Reason: " + reason + "\n\n"
                        + "Next steps: You're welcome to contact your DigiBank advisor for more detail, or reapply in the future "
                        + "if your circumstances change.",
                "APPLICATION_UPDATE", appRef);

        Map<String, String> variables = text.commonEmailVariables(app);
        variables.put("declineReason", reason);
        variables.put("reviewedBy", reviewedBy);
        emailClient.send("DECISION_DECLINED", app.getCustomerEmail(), variables);
        return app;
    }

    @Transactional
    public LoanApplication sendBackApplication(String appRef, String reason, String reviewedBy, boolean requireGuarantor) {
        LoanApplication app = getByRef(appRef);
        app.setStatus("IN_PROGRESS");

        boolean guarantorNewlyNeeded = requireGuarantor && app.getGuarantorDetailsJson() == null;
        if (requireGuarantor) {
            app.setGuarantorRequired(true);
        }
        app.setCurrentSection(guarantorNewlyNeeded ? "guarantorDetails" : "reviewSubmit");
        repository.save(app);
        auditTrailService.addNote(appRef, "general", reason, "SEND_BACK", reviewedBy);

        String guarantorNote = guarantorNewlyNeeded
                ? " A guarantor is now required for this application — please complete the new Guarantor Details section, "
                  + "including a supporting document for your guarantor, before resubmitting."
                : "";
        notificationClient.send(app.getCustomerId(), "Action Needed on Your Loan Application",
                text.greeting(app) + " Thank you for applying for a personal loan for " + text.loanPurpose(app) + " with DigiBank. "
                        + "Our underwriting team has reviewed your application and sent it back for a few additional details "
                        + "before we can proceed.\n\n"
                        + "Underwriter's note: " + reason + "\n\n"
                        + "Next steps: Please log in to your DigiBank portal, review the feedback on your application, "
                        + "update the relevant section(s), upload any supporting documents if requested, and resubmit "
                        + "for review." + guarantorNote,
                "APPLICATION_UPDATE", appRef);

        Map<String, String> variables = text.commonEmailVariables(app);
        variables.put("sendBackReason", reason);
        variables.put("reviewedBy", reviewedBy);
        variables.put("guarantorRequiredNote", guarantorNote);
        emailClient.send("SEND_BACK", app.getCustomerEmail(), variables);
        return app;
    }

    /** @param callerRole null skips the mandate check (used by the system auto-approval path,
     * which is bounded by AffordabilityClient's own threshold instead — see maybeAutoApprove). */
    @Transactional
    public LoanApplication approveApplicationByUnderwriter(String appRef, String reviewedBy, BigDecimal approvedAmount, String callerRole) {
        if (callerRole != null && approvedAmount != null && approvedAmount.compareTo(ruleServiceClient.getMandateRules().limitFor(callerRole)) > 0) {
            // Server-side mandate enforcement — the frontend already blocks a role from entering an
            // amount above its limit, but that's advisory UI only (ARCHITECTURE.md §5/§9); a valid
            // token replayed directly against this endpoint (e.g. via Postman) previously had
            // nothing stopping it from approving any amount regardless of role
            // (PRODUCTION_READINESS.md §5, fixed 2026-08-28).
            throw new IllegalArgumentException(
                    "Approved amount exceeds the mandate limit for your role (" + callerRole
                            + "). Refer this application to a more senior approver instead.");
        }

        LoanApplication app = getByRef(appRef);
        app.setStatus("APPROVED");
        app.setApprovedAmount(approvedAmount);
        repository.save(app);
        auditTrailService.addNote(appRef, "general", "Application approved.", "DECISION_APPROVED", reviewedBy);

        notificationClient.send(app.getCustomerId(), "Your Loan Application Has Been Approved!",
                text.greeting(app) + " Congratulations! Your personal loan application for " + text.loanPurpose(app)
                        + " has been reviewed and approved by our underwriting team.\n\n"
                        + "Next steps: Please log in to your DigiBank portal to view your approval letter and loan agreement "
                        + "documents in the Documents section.",
                "APPROVAL", appRef);

        Map<String, String> variables = text.commonEmailVariables(app);
        variables.put("approvedAmount", approvedAmount != null ? approvedAmount.toString() : "");
        variables.put("reviewedBy", reviewedBy);
        emailClient.send("DECISION_APPROVED", app.getCustomerEmail(), variables);

        generateFinalApprovalLetter(app);
        return app;
    }

    @Transactional
    public LoanApplication approveApplication(String appRef) {
        LoanApplication app = getByRef(appRef);
        if (!"APPROVED".equals(app.getStatus())) {
            app.setStatus("CONDITIONALLY_APPROVED");
            repository.save(app);
        }
        return app;
    }

    @Transactional
    public LoanApplication referToSeniorUnderwriter(String appRef, String reason, String reviewedBy) {
        LoanApplication app = getByRef(appRef);
        app.setStatus("REFERRED_TO_SENIOR");
        repository.save(app);
        auditTrailService.addNote(appRef, "general", reason, "REFERRED_TO_SENIOR", reviewedBy);
        return app;
    }

    @Transactional
    public LoanApplication authoriseFundRelease(String appRef, String reviewedBy) {
        LoanApplication app = getByRef(appRef);
        app.setDisbursementStatus("FUNDS_RELEASED");
        repository.save(app);
        auditTrailService.addNote(appRef, "disbursement", "Fund release authorised.", "DISBURSEMENT_AUTHORISED", reviewedBy);

        notificationClient.send(app.getCustomerId(), "Your Loan Funds Have Been Released",
                text.greeting(app) + " Great news — your loan funds for " + text.loanPurpose(app)
                        + " have been authorised for release and will be transferred to your nominated account shortly.",
                "APPROVAL", appRef);

        Map<String, String> variables = text.commonEmailVariables(app);
        variables.put("reviewedBy", reviewedBy);
        emailClient.send("DISBURSEMENT_AUTHORISED", app.getCustomerEmail(), variables);
        return app;
    }

    @Transactional
    public LoanApplication submitForSecondCheck(String appRef, String reviewedBy) {
        LoanApplication app = getByRef(appRef);
        app.setDisbursementStatus("SECOND_CHECK_PENDING");
        repository.save(app);
        auditTrailService.addNote(appRef, "disbursement", "Submitted for second checks before fund release.", "SECOND_CHECK_PENDING", reviewedBy);
        return app;
    }

    /** Triggered by WizardService.selectProduct() right after a product is selected — auto-approval
     * is a decisioning action even though a wizard event fires it, so the logic (and its
     * AffordabilityClient dependency) lives here, not in the wizard context. */
    public void maybeAutoApprove(LoanApplication app) {
        try {
            // Business loans always go to manual underwriter review for now — the auto-approval
            // threshold below is sized for personal-loan amounts/risk and reads loanRequirementsJson,
            // which business applications never populate (their amount lives in companyDetailsJson).
            if ("BUSINESS".equals(app.getApplicationType())) return;
            if (app.getAffordabilityResultJson() == null) return;
            JsonNode result = objectMapper.readTree(app.getAffordabilityResultJson());
            if (!result.path("passed").asBoolean(false)) return;

            JsonNode personal = app.getPersonalDetailsJson() != null ? objectMapper.readTree(app.getPersonalDetailsJson()) : null;
            boolean jointApplication = personal != null && personal.has("applicant2") && !personal.get("applicant2").isNull();

            BigDecimal threshold = affordabilityClient.getAutoApprovalThreshold(jointApplication);
            if (threshold == null) return;

            JsonNode loan = app.getLoanRequirementsJson() != null ? objectMapper.readTree(app.getLoanRequirementsJson()) : null;
            BigDecimal loanAmount = BigDecimal.valueOf(loan != null ? loan.path("loanAmount").asDouble(0) : 0);
            if (loanAmount.compareTo(threshold) > 0) return;

            approveApplicationByUnderwriter(app.getApplicationRef(), "System (Auto-Approval)", loanAmount, null);
        } catch (Exception ignored) {
            // Auto-approval is a convenience; failures fall back to manual underwriter review.
        }
    }

    private void generateFinalApprovalLetter(LoanApplication app) {
        try {
            JsonNode product = app.getSelectedProductJson() != null ? objectMapper.readTree(app.getSelectedProductJson()) : null;
            JsonNode loan = app.getLoanRequirementsJson() != null ? objectMapper.readTree(app.getLoanRequirementsJson()) : null;
            JsonNode personal = app.getPersonalDetailsJson() != null ? objectMapper.readTree(app.getPersonalDetailsJson()) : null;
            if (product == null || loan == null) return;

            String customerName = personal != null
                    ? (personal.path("firstName").asText("") + " " + personal.path("lastName").asText("")).trim()
                    : app.getCustomerEmail();

            double approvedAmount = app.getApprovedAmount() != null
                    ? app.getApprovedAmount().doubleValue() : loan.path("loanAmount").asDouble(0);

            documentClient.generateFinalApprovalLetter(
                    app.getApplicationRef(), app.getCustomerId(), customerName,
                    approvedAmount,
                    product.path("productName").asText(""),
                    product.path("interestRate").asDouble(0),
                    product.path("termMonths").asInt(0),
                    product.path("monthlyRepayment").asDouble(0));
        } catch (Exception ignored) {
            // Document generation failure should never block an underwriting decision.
        }
    }

    private LoanApplication getByRef(String appRef) {
        return repository.findByApplicationRef(appRef)
                .orElseThrow(() -> new IllegalArgumentException("Application not found: " + appRef));
    }
}
