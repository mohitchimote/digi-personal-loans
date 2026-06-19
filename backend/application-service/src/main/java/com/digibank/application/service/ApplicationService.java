package com.digibank.application.service;

import com.digibank.application.client.AffordabilityClient;
import com.digibank.application.client.DocumentClient;
import com.digibank.application.client.NotificationClient;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.model.UnderwritingNote;
import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.repository.UnderwritingNoteRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.Year;
import java.util.List;
import java.util.Map;
import java.util.Random;

@Service
public class ApplicationService {

    private final LoanApplicationRepository repository;
    private final UnderwritingNoteRepository noteRepository;
    private final ObjectMapper objectMapper;
    private final NotificationClient notificationClient;
    private final DocumentClient documentClient;
    private final AffordabilityClient affordabilityClient;

    private static final List<String> PIPELINE_STATUSES = List.of(
            "SUBMITTED", "UNDER_REVIEW", "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR", "APPROVED");

    public ApplicationService(LoanApplicationRepository repository, UnderwritingNoteRepository noteRepository,
                               ObjectMapper objectMapper, NotificationClient notificationClient, DocumentClient documentClient,
                               AffordabilityClient affordabilityClient) {
        this.repository = repository;
        this.noteRepository = noteRepository;
        this.objectMapper = objectMapper;
        this.notificationClient = notificationClient;
        this.documentClient = documentClient;
        this.affordabilityClient = affordabilityClient;
    }

    private static final List<String> ACTIVE_STATUSES = List.of("DRAFT", "IN_PROGRESS");
    private static final List<String> ALL_SECTIONS = List.of(
            "loanRequirements", "personalDetails", "connectBank", "incomeEmployment",
            "outgoings", "creditDeclarations", "verifyId", "directDebit", "reviewSubmit"
    );

    @Transactional
    public LoanApplication createOrResumeApplication(Long customerId, String email) {
        return repository.findFirstByCustomerIdAndStatusInOrderByUpdatedAtDesc(customerId, ACTIVE_STATUSES)
                .orElseGet(() -> {
                    LoanApplication app = LoanApplication.builder()
                            .applicationRef(generateApplicationRef())
                            .customerId(customerId)
                            .customerEmail(email)
                            .status("DRAFT")
                            .currentSection("loanRequirements")
                            .completionPercentage(0)
                            .build();
                    return repository.save(app);
                });
    }

    @Transactional
    public LoanApplication saveSection(String appRef, String section, Map<String, Object> data) {
        LoanApplication app = getByRef(appRef);

        try {
            String json = objectMapper.writeValueAsString(data);
            switch (section) {
                case "loanRequirements"   -> app.setLoanRequirementsJson(json);
                case "consentManagement"  -> app.setConsentManagementJson(json);
                case "personalDetails"    -> app.setPersonalDetailsJson(json);
                case "connectBank"        -> app.setBankConnectionJson(json);
                case "incomeEmployment"   -> app.setIncomeEmploymentJson(json);
                case "outgoings"          -> app.setOutgoingsJson(json);
                case "creditDeclarations" -> app.setCreditDeclarationsJson(json);
                case "verifyId"           -> app.setVerifyIdJson(json);
                case "directDebit"        -> app.setDirectDebitJson(json);
                case "reviewSubmit"       -> app.setReviewSubmitJson(json);
                default -> throw new IllegalArgumentException("Unknown section: " + section);
            }
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize section data", e);
        }

        app.setStatus("IN_PROGRESS");
        app.setCurrentSection(nextSection(section));
        app.setCompletionPercentage(calculateCompletion(app));

        return repository.save(app);
    }

    @Transactional
    public LoanApplication saveSectionByUnderwriter(String appRef, String section, Map<String, Object> data, String editedBy) {
        LoanApplication app = getByRef(appRef);

        try {
            String json = objectMapper.writeValueAsString(data);
            switch (section) {
                case "loanRequirements"   -> app.setLoanRequirementsJson(json);
                case "consentManagement"  -> app.setConsentManagementJson(json);
                case "personalDetails"    -> app.setPersonalDetailsJson(json);
                case "connectBank"        -> app.setBankConnectionJson(json);
                case "incomeEmployment"   -> app.setIncomeEmploymentJson(json);
                case "outgoings"          -> app.setOutgoingsJson(json);
                case "creditDeclarations" -> app.setCreditDeclarationsJson(json);
                case "verifyId"           -> app.setVerifyIdJson(json);
                case "directDebit"        -> app.setDirectDebitJson(json);
                default -> throw new IllegalArgumentException("Unknown section: " + section);
            }
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize section data", e);
        }

        repository.save(app);
        addNote(appRef, section, "Section edited by underwriter.", "EDIT", editedBy);
        return app;
    }

    @Transactional
    public LoanApplication submitApplication(String appRef) {
        LoanApplication app = getByRef(appRef);
        app.setStatus("SUBMITTED");
        app.setSubmittedAt(LocalDateTime.now());
        app.setCompletionPercentage(100);
        return repository.save(app);
    }

    @Transactional
    public LoanApplication saveAffordabilityResult(String appRef, Map<String, Object> result) {
        LoanApplication app = getByRef(appRef);
        try {
            app.setAffordabilityResultJson(objectMapper.writeValueAsString(result));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize affordability result", e);
        }
        return repository.save(app);
    }

    @Transactional
    public LoanApplication selectProduct(String appRef, Map<String, Object> productData) {
        LoanApplication app = getByRef(appRef);
        app.setSelectedProductId(String.valueOf(productData.get("productId")));
        try {
            app.setSelectedProductJson(objectMapper.writeValueAsString(productData));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize product data", e);
        }
        app.setStatus("UNDER_REVIEW");
        repository.save(app);

        maybeAutoApprove(app);
        return app;
    }

    private void maybeAutoApprove(LoanApplication app) {
        try {
            if (app.getAffordabilityResultJson() == null) return;
            JsonNode result = objectMapper.readTree(app.getAffordabilityResultJson());
            if (!result.path("passed").asBoolean(false)) return;

            JsonNode personal = app.getPersonalDetailsJson() != null ? objectMapper.readTree(app.getPersonalDetailsJson()) : null;
            boolean jointApplication = personal != null && personal.has("applicant2") && !personal.get("applicant2").isNull();

            java.math.BigDecimal threshold = affordabilityClient.getAutoApprovalThreshold(jointApplication);
            if (threshold == null) return;

            JsonNode loan = app.getLoanRequirementsJson() != null ? objectMapper.readTree(app.getLoanRequirementsJson()) : null;
            java.math.BigDecimal loanAmount = java.math.BigDecimal.valueOf(loan != null ? loan.path("loanAmount").asDouble(0) : 0);
            if (loanAmount.compareTo(threshold) > 0) return;

            approveApplicationByUnderwriter(app.getApplicationRef(), "System (Auto-Approval)", loanAmount);
        } catch (Exception ignored) {
            // Auto-approval is a convenience; failures fall back to manual underwriter review.
        }
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

    public LoanApplication getApplication(String appRef) {
        return getByRef(appRef);
    }

    public List<LoanApplication> getApplicationsByCustomer(Long customerId) {
        return repository.findByCustomerIdOrderByCreatedAtDesc(customerId);
    }

    public LoanApplication getCurrentApplication(Long customerId) {
        return repository.findFirstByCustomerIdOrderByUpdatedAtDesc(customerId)
                .orElseThrow(() -> new IllegalArgumentException("No application found for customer: " + customerId));
    }

    @Transactional
    public LoanApplication withdrawApplication(String appRef) {
        LoanApplication app = getByRef(appRef);
        if (!"SUBMITTED".equals(app.getStatus()) && !"UNDER_REVIEW".equals(app.getStatus())) {
            throw new IllegalStateException("Only submitted applications can be pulled back: " + appRef);
        }
        app.setStatus("IN_PROGRESS");
        app.setCurrentSection("reviewSubmit");
        return repository.save(app);
    }

    public List<LoanApplication> getPipeline() {
        return repository.findByStatusInOrderBySubmittedAtAsc(PIPELINE_STATUSES);
    }

    private static final List<String> CANCELLABLE_STATUSES = List.of(
            "DRAFT", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR");

    @Transactional
    public LoanApplication cancelApplication(String appRef) {
        LoanApplication app = getByRef(appRef);
        if (!CANCELLABLE_STATUSES.contains(app.getStatus())) {
            throw new IllegalStateException("Application cannot be cancelled in its current status: " + appRef);
        }
        app.setStatus("WITHDRAWN");
        return repository.save(app);
    }

    @Transactional
    public LoanApplication declineApplication(String appRef, String reason, String reviewedBy) {
        LoanApplication app = getByRef(appRef);
        app.setStatus("DECLINED");
        repository.save(app);
        addNote(appRef, "general", reason, "DECISION_DECLINED", reviewedBy);

        notificationClient.send(app.getCustomerId(), "Update on Your Loan Application",
                greeting(app) + " Thank you for applying for a personal loan for " + loanPurpose(app) + " with DigiBank. "
                        + "After careful review, we are unable to approve your application at this time.\n\n"
                        + "Reason: " + reason + "\n\n"
                        + "Next steps: You're welcome to contact your DigiBank advisor for more detail, or reapply in the future "
                        + "if your circumstances change.",
                "APPLICATION_UPDATE", appRef);
        return app;
    }

    @Transactional
    public LoanApplication sendBackApplication(String appRef, String reason, String reviewedBy) {
        LoanApplication app = getByRef(appRef);
        app.setStatus("IN_PROGRESS");
        app.setCurrentSection("reviewSubmit");
        repository.save(app);
        addNote(appRef, "general", reason, "SEND_BACK", reviewedBy);

        notificationClient.send(app.getCustomerId(), "Action Needed on Your Loan Application",
                greeting(app) + " Thank you for applying for a personal loan for " + loanPurpose(app) + " with DigiBank. "
                        + "Our underwriting team has reviewed your application and sent it back for a few additional details "
                        + "before we can proceed.\n\n"
                        + "Underwriter's note: " + reason + "\n\n"
                        + "Next steps: Please log in to your DigiBank portal, review the feedback on your application, "
                        + "update the relevant section(s), upload any supporting documents if requested, and resubmit "
                        + "for review.",
                "APPLICATION_UPDATE", appRef);
        return app;
    }

    @Transactional
    public LoanApplication approveApplicationByUnderwriter(String appRef, String reviewedBy, java.math.BigDecimal approvedAmount) {
        LoanApplication app = getByRef(appRef);
        app.setStatus("APPROVED");
        app.setApprovedAmount(approvedAmount);
        repository.save(app);
        addNote(appRef, "general", "Application approved.", "DECISION_APPROVED", reviewedBy);

        notificationClient.send(app.getCustomerId(), "Your Loan Application Has Been Approved!",
                greeting(app) + " Congratulations! Your personal loan application for " + loanPurpose(app)
                        + " has been reviewed and approved by our underwriting team.\n\n"
                        + "Next steps: Please log in to your DigiBank portal to view your approval letter and loan agreement "
                        + "documents in the Documents section.",
                "APPROVAL", appRef);

        generateFinalApprovalLetter(app);
        return app;
    }

    @Transactional
    public LoanApplication referToSeniorUnderwriter(String appRef, String reason, String reviewedBy) {
        LoanApplication app = getByRef(appRef);
        app.setStatus("REFERRED_TO_SENIOR");
        repository.save(app);
        addNote(appRef, "general", reason, "REFERRED_TO_SENIOR", reviewedBy);
        return app;
    }

    @Transactional
    public LoanApplication authoriseFundRelease(String appRef, String reviewedBy) {
        LoanApplication app = getByRef(appRef);
        app.setDisbursementStatus("FUNDS_RELEASED");
        repository.save(app);
        addNote(appRef, "disbursement", "Fund release authorised.", "DISBURSEMENT_AUTHORISED", reviewedBy);

        notificationClient.send(app.getCustomerId(), "Your Loan Funds Have Been Released",
                greeting(app) + " Great news — your loan funds for " + loanPurpose(app)
                        + " have been authorised for release and will be transferred to your nominated account shortly.",
                "APPROVAL", appRef);
        return app;
    }

    @Transactional
    public LoanApplication submitForSecondCheck(String appRef, String reviewedBy) {
        LoanApplication app = getByRef(appRef);
        app.setDisbursementStatus("SECOND_CHECK_PENDING");
        repository.save(app);
        addNote(appRef, "disbursement", "Submitted for second checks before fund release.", "SECOND_CHECK_PENDING", reviewedBy);
        return app;
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

    @Transactional
    public UnderwritingNote addNote(String appRef, String section, String note, String noteType, String createdBy) {
        LoanApplication app = getByRef(appRef);
        UnderwritingNote entity = new UnderwritingNote();
        entity.setApplicationRef(appRef);
        entity.setSection(section);
        entity.setNote(note);
        entity.setNoteType(noteType);
        entity.setCreatedBy(createdBy);
        UnderwritingNote saved = noteRepository.save(entity);

        if ("CLARIFICATION_REQUEST".equals(noteType) || "DOCUMENT_REQUEST".equals(noteType)) {
            boolean isDocRequest = "DOCUMENT_REQUEST".equals(noteType);
            notificationClient.send(app.getCustomerId(),
                    isDocRequest ? "Document Required for Your Loan Application" : "Clarification Needed on Your Loan Application",
                    greeting(app) + " Thank you for applying for a personal loan for " + loanPurpose(app) + " with DigiBank. "
                            + "Our underwriting team is reviewing your " + sectionLabel(section) + " details and needs "
                            + (isDocRequest ? "an additional document" : "some clarification") + " before we can proceed.\n\n"
                            + "Underwriter's note: " + note + "\n\n"
                            + "Next steps: " + (isDocRequest
                                ? "Please log in to your DigiBank portal and upload the requested document from the Documents section."
                                : "Please log in to your DigiBank portal, review your application, and update the relevant section.")
                            + " Once done, your application will be back in the underwriting queue.",
                    "APPLICATION_UPDATE", appRef);
        }

        return saved;
    }

    private String greeting(LoanApplication app) {
        String firstName = "Customer";
        try {
            if (app.getPersonalDetailsJson() != null) {
                JsonNode node = objectMapper.readTree(app.getPersonalDetailsJson());
                if (node.has("firstName") && !node.get("firstName").asText().isBlank()) {
                    firstName = node.get("firstName").asText();
                }
            }
        } catch (Exception ignored) { }
        return "Dear " + firstName + ",";
    }

    private String loanPurpose(LoanApplication app) {
        try {
            if (app.getLoanRequirementsJson() != null) {
                JsonNode node = objectMapper.readTree(app.getLoanRequirementsJson());
                if (node.has("loanPurpose") && !node.get("loanPurpose").asText().isBlank()) {
                    return node.get("loanPurpose").asText();
                }
            }
        } catch (Exception ignored) { }
        return "your requested purpose";
    }

    private String sectionLabel(String section) {
        return switch (section) {
            case "loanRequirements"   -> "Loan Requirements";
            case "consentManagement"  -> "Consent Management";
            case "personalDetails"    -> "Personal Details";
            case "connectBank"        -> "Bank Connection";
            case "incomeEmployment"   -> "Income & Employment";
            case "outgoings"          -> "Outgoings & Expenditure";
            case "creditDeclarations" -> "Credit Declarations";
            case "verifyId"           -> "ID Verification";
            case "directDebit"        -> "Direct Debit Details";
            default -> "application";
        };
    }

    public List<UnderwritingNote> getNotes(String appRef) {
        return noteRepository.findByApplicationRefOrderByCreatedAtDesc(appRef);
    }

    private LoanApplication getByRef(String appRef) {
        return repository.findByApplicationRef(appRef)
                .orElseThrow(() -> new IllegalArgumentException("Application not found: " + appRef));
    }

    private int calculateCompletion(LoanApplication app) {
        long filled = ALL_SECTIONS.stream().filter(section -> switch (section) {
            case "loanRequirements"   -> app.getLoanRequirementsJson() != null;
            case "personalDetails"    -> app.getPersonalDetailsJson() != null;
            case "connectBank"        -> app.getBankConnectionJson() != null;
            case "incomeEmployment"   -> app.getIncomeEmploymentJson() != null;
            case "outgoings"          -> app.getOutgoingsJson() != null;
            case "creditDeclarations" -> app.getCreditDeclarationsJson() != null;
            case "verifyId"           -> app.getVerifyIdJson() != null;
            case "directDebit"        -> app.getDirectDebitJson() != null;
            case "reviewSubmit"       -> app.getReviewSubmitJson() != null;
            default -> false;
        }).count();
        return (int) (filled * 100 / ALL_SECTIONS.size());
    }

    private String nextSection(String currentSection) {
        int idx = ALL_SECTIONS.indexOf(currentSection);
        return (idx >= 0 && idx < ALL_SECTIONS.size() - 1)
                ? ALL_SECTIONS.get(idx + 1)
                : currentSection;
    }

    private String generateApplicationRef() {
        int year = Year.now().getValue();
        int seq = 10000 + new Random().nextInt(89999);
        return "DGB-" + year + "-" + seq;
    }
}
