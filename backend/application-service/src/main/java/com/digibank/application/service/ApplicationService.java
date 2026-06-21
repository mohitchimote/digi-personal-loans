package com.digibank.application.service;

import com.digibank.application.client.AffordabilityClient;
import com.digibank.application.client.DocumentClient;
import com.digibank.application.client.NotificationClient;
import com.digibank.application.client.ProductClient;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

@Service
public class ApplicationService {

    private final LoanApplicationRepository repository;
    private final UnderwritingNoteRepository noteRepository;
    private final ObjectMapper objectMapper;
    private final NotificationClient notificationClient;
    private final DocumentClient documentClient;
    private final AffordabilityClient affordabilityClient;
    private final ProductClient productClient;

    private static final List<String> PIPELINE_STATUSES = List.of(
            "SUBMITTED", "UNDER_REVIEW", "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR", "APPROVED");

    public ApplicationService(LoanApplicationRepository repository, UnderwritingNoteRepository noteRepository,
                               ObjectMapper objectMapper, NotificationClient notificationClient, DocumentClient documentClient,
                               AffordabilityClient affordabilityClient, ProductClient productClient) {
        this.repository = repository;
        this.noteRepository = noteRepository;
        this.objectMapper = objectMapper;
        this.notificationClient = notificationClient;
        this.documentClient = documentClient;
        this.affordabilityClient = affordabilityClient;
        this.productClient = productClient;
    }

    private static final List<String> ACTIVE_STATUSES = List.of("DRAFT", "IN_PROGRESS");
    private static final List<String> ALL_SECTIONS = List.of(
            "loanRequirements", "personalDetails", "connectBank", "incomeEmployment",
            "outgoings", "creditDeclarations", "verifyId", "directDebit", "reviewSubmit"
    );

    /** Sections that must always be visited explicitly, even when pre-filled (e.g. via the
     * pre-approved fast-track flow) — personalDetails carries the consent gate, connectBank is
     * where the customer confirms/changes the repayment account, reviewSubmit is always last. */
    private static final Set<String> MANDATORY_STOPS = Set.of("personalDetails", "connectBank", "reviewSubmit");

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

    /** Fast-track entry point for an existing customer accepting a pre-approved offer (see the
     * dashboard "Apply Now" card). Pre-fills every section with synthetic-but-plausible data
     * representing what the bank already knows about the customer, except personalDetails
     * (identity verification + consent) and connectBank (confirm repayment account), which stay
     * null so the customer still passes through those two stops explicitly via nextSection()'s
     * MANDATORY_STOPS. Demo-only: the synthetic profile values are illustrative, not derived from
     * a real core-banking system. */
    @Transactional
    public LoanApplication createPreApprovedApplication(Long customerId, String customerEmail, String nationalId) {
        Map<String, Object> offer = productClient.getPreApprovedOffer(nationalId);
        if (offer == null) {
            throw new IllegalArgumentException("No pre-approved offer found for this customer.");
        }

        LoanApplication app = LoanApplication.builder()
                .applicationRef(generateApplicationRef())
                .customerId(customerId)
                .customerEmail(customerEmail)
                .status("IN_PROGRESS")
                .currentSection("personalDetails")
                .build();

        try {
            app.setLoanRequirementsJson(objectMapper.writeValueAsString(Map.of(
                    "loanAmount", offer.get("amount"),
                    "loanPurpose", "Pre-Approved Offer",
                    "loanTerm", offer.get("termMonths"),
                    "numberOfApplicants", 1
            )));

            Map<String, Object> personalDetails = new LinkedHashMap<>();
            personalDetails.put("firstName", "Noa");
            personalDetails.put("lastName", "Levi");
            personalDetails.put("dateOfBirth", "1988-04-12");
            personalDetails.put("nationalId", nationalId);
            personalDetails.put("idIssueDate", "2018-01-01");
            personalDetails.put("nationality", "Israeli");
            personalDetails.put("maritalStatus", "Married");
            personalDetails.put("dependents", 1);
            personalDetails.put("phoneNumber", "+972 50 123 4567");
            personalDetails.put("email", customerEmail);
            personalDetails.put("street", "12 Rothschild Boulevard");
            personalDetails.put("city", "Tel Aviv");
            personalDetails.put("postCode", "6688112");
            personalDetails.put("country", "Israel");
            personalDetails.put("monthsAtCurrentAddress", 48);
            personalDetails.put("previousAddresses", List.of());
            personalDetails.put("assistedByStaff", false);
            personalDetails.put("staffNationalId", "");
            personalDetails.put("preferredBranch", "");
            app.setPersonalDetailsJson(objectMapper.writeValueAsString(personalDetails));

            Map<String, Object> bankConnection = new LinkedHashMap<>();
            bankConnection.put("connected", true);
            bankConnection.put("bankId", "leumi");
            bankConnection.put("bankName", "Bank Leumi");
            bankConnection.put("summary", Map.of("accountMasked", "**** **** **** 7421", "avgBalance", 48250, "transactions", 62));
            bankConnection.put("applicant2", null);
            app.setBankConnectionJson(objectMapper.writeValueAsString(bankConnection));

            Map<String, Object> incomeEmployment = new LinkedHashMap<>();
            incomeEmployment.put("employmentStatus", "Employed");
            incomeEmployment.put("employer", "Teva Pharmaceutical Industries");
            incomeEmployment.put("jobTitle", "Senior Operations Manager");
            incomeEmployment.put("employmentDuration", "6 years");
            incomeEmployment.put("monthlyGrossIncome", 28000);
            incomeEmployment.put("monthlyNetIncome", 21500);
            incomeEmployment.put("otherIncome", 0);
            incomeEmployment.put("employments", List.of(Map.of(
                    "employmentStatus", "Employed", "employer", "Teva Pharmaceutical Industries",
                    "jobTitle", "Senior Operations Manager", "employmentDuration", "6 years",
                    "monthlyGrossIncome", 28000, "monthlyNetIncome", 21500, "otherIncome", 0
            )));
            incomeEmployment.put("applicant2", null);
            app.setIncomeEmploymentJson(objectMapper.writeValueAsString(incomeEmployment));

            app.setOutgoingsJson(objectMapper.writeValueAsString(Map.of(
                    "monthlyRent", 0,
                    "monthlyMortgage", 4200,
                    "monthlyLoans", 0,
                    "creditCardPayments", 800,
                    "otherMonthlyCommitments", 300,
                    "monthlyLivingExpenses", 5500
            )));

            Map<String, Object> creditDeclarations = new LinkedHashMap<>();
            creditDeclarations.put("hasDefaulted", false);
            creditDeclarations.put("hasBankruptcy", false);
            creditDeclarations.put("hasCCJ", false);
            creditDeclarations.put("hasPaymentPlan", false);
            creditDeclarations.put("creditScore", 9);
            creditDeclarations.put("applicant2", null);
            app.setCreditDeclarationsJson(objectMapper.writeValueAsString(creditDeclarations));

            app.setVerifyIdJson(objectMapper.writeValueAsString(Map.of(
                    "idVerified", true,
                    "files", List.of("national_id_on_file.pdf")
            )));

            Map<String, Object> directDebit = new LinkedHashMap<>();
            directDebit.put("accountSource", "manual");
            directDebit.put("accountHolderName", "Noa Levi");
            directDebit.put("bankCode", "10");
            directDebit.put("branchCode", "938");
            directDebit.put("accountNumber", "07421639");
            directDebit.put("preferredRepaymentDay", 1);
            directDebit.put("confirmAuthorisation", true);
            directDebit.put("bankName", "Bank Leumi");
            directDebit.put("branchName", "Rothschild Branch");
            directDebit.put("guarantorName", "");
            directDebit.put("guarantorNationalId", "");
            directDebit.put("guarantorRelationship", "");
            directDebit.put("guarantorPhone", "");
            directDebit.put("guarantorEmail", "");
            app.setDirectDebitJson(objectMapper.writeValueAsString(directDebit));

            app.setSelectedProductId((String) offer.get("productCode"));
            app.setSelectedProductJson(objectMapper.writeValueAsString(Map.of(
                    "applicationRef", app.getApplicationRef(),
                    "productCode", offer.get("productCode"),
                    "productName", offer.get("productName"),
                    "termMonths", offer.get("termMonths"),
                    "monthlyRepayment", offer.get("monthlyRepayment"),
                    "totalRepayable", offer.get("totalRepayable"),
                    "apr", offer.get("annualInterestRate")
            )));

            Map<String, Object> affordabilityResult = new LinkedHashMap<>();
            affordabilityResult.put("passed", true);
            affordabilityResult.put("dti", 22.4);
            affordabilityResult.put("hti", 15.0);
            affordabilityResult.put("disposableIncome", 10700);
            affordabilityResult.put("monthlyRepaymentCapacity", 4280);
            affordabilityResult.put("calculatedMonthlyRepayment", offer.get("monthlyRepayment"));
            affordabilityResult.put("failureReasons", List.of());
            affordabilityResult.put("riskCategory", "LOW");
            affordabilityResult.put("creditScoreCategory", "EXCELLENT");
            app.setAffordabilityResultJson(objectMapper.writeValueAsString(affordabilityResult));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize pre-approved application data", e);
        }

        app.setCompletionPercentage(calculateCompletion(app));
        LoanApplication saved = repository.save(app);
        productClient.consumePreApprovedOffer(nationalId);
        return saved;
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
        app.setCurrentSection(nextSection(section, app));
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

    private boolean isSectionFilled(LoanApplication app, String section) {
        return switch (section) {
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
        };
    }

    private int calculateCompletion(LoanApplication app) {
        long filled = ALL_SECTIONS.stream().filter(section -> isSectionFilled(app, section)).count();
        return (int) (filled * 100 / ALL_SECTIONS.size());
    }

    /** Normally advances one section at a time. Skips forward over any later section that's
     * already filled in (e.g. pre-filled by the pre-approved fast-track flow), except the
     * permanent MANDATORY_STOPS — so the standard journey is unaffected (every later section is
     * null until reached in order) while a fast-track application jumps straight to the next
     * thing that actually needs the customer's attention. */
    private String nextSection(String currentSection, LoanApplication app) {
        int idx = ALL_SECTIONS.indexOf(currentSection);
        for (int i = idx + 1; i < ALL_SECTIONS.size(); i++) {
            String candidate = ALL_SECTIONS.get(i);
            if (MANDATORY_STOPS.contains(candidate) || !isSectionFilled(app, candidate)) {
                return candidate;
            }
        }
        return ALL_SECTIONS.get(ALL_SECTIONS.size() - 1);
    }

    private String generateApplicationRef() {
        int year = Year.now().getValue();
        int seq = 10000 + new Random().nextInt(89999);
        return "DGB-" + year + "-" + seq;
    }
}
