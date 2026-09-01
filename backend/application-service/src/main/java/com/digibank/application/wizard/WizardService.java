package com.digibank.application.wizard;

import com.digibank.application.audittrail.AuditTrailService;
import com.digibank.application.client.EmailClient;
import com.digibank.application.client.NotificationText;
import com.digibank.application.client.ProductClient;
import com.digibank.application.decisioning.DecisioningService;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
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

/**
 * Wizard/section-engine context (ARCHITECTURE.md §10) — section save/read, skip-forward mechanic,
 * start/resume, joint-applicant handling. Depends on DecisioningService for one thing only —
 * triggering auto-approval right after a product is selected (see selectProduct) — and on
 * AuditTrailService for the note an underwriter's section edit leaves.
 */
@Service
public class WizardService {

    private final LoanApplicationRepository repository;
    private final ObjectMapper objectMapper;
    private final ProductClient productClient;
    private final DecisioningService decisioningService;
    private final AuditTrailService auditTrailService;
    private final NotificationText text;
    private final EmailClient emailClient;

    private static final List<String> ACTIVE_STATUSES = List.of("DRAFT", "IN_PROGRESS");

    private static final List<String> CANCELLABLE_STATUSES = List.of(
            "DRAFT", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR");

    /** "guarantorDetails" sits right after personalDetails but is normally skipped — see
     * isSectionFilled(), which treats it as filled/skippable unless an underwriter has flagged
     * guarantorRequired via DecisioningService.sendBackApplication(). */
    private static final List<String> ALL_SECTIONS = List.of(
            "loanRequirements", "personalDetails", "guarantorDetails", "connectBank", "incomeEmployment",
            "outgoings", "creditDeclarations", "verifyId", "directDebit", "reviewSubmit"
    );

    /** Business-loan equivalent of ALL_SECTIONS — companyDetails doubles as "loan requirements"
     * for a business application (amount/purpose/term captured alongside company identity).
     * guarantorDetails sits after signatories (the closest business equivalent of personalDetails),
     * same skip-unless-required semantics as the personal list. */
    private static final List<String> BUSINESS_SECTIONS = List.of(
            "companyDetails", "signatories", "guarantorDetails", "connectBusinessBank", "businessFinancials",
            "businessOutgoings", "businessCreditDeclarations", "verifyId", "directDebit", "reviewSubmit"
    );

    /** Sections that must always be visited explicitly, even when pre-filled (e.g. via the
     * pre-approved fast-track flow) — personalDetails carries the consent gate, connectBank is
     * where the customer confirms/changes the repayment account, reviewSubmit is always last. */
    private static final Set<String> MANDATORY_STOPS = Set.of("personalDetails", "connectBank", "reviewSubmit");

    public WizardService(LoanApplicationRepository repository, ObjectMapper objectMapper, ProductClient productClient,
                          DecisioningService decisioningService, AuditTrailService auditTrailService,
                          NotificationText text, EmailClient emailClient) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.productClient = productClient;
        this.decisioningService = decisioningService;
        this.auditTrailService = auditTrailService;
        this.text = text;
        this.emailClient = emailClient;
    }

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
                            .applicationType("PERSONAL")
                            .build();
                    return repository.save(app);
                });
    }

    /** Business-loan equivalent of createOrResumeApplication — same resume-an-active-draft
     * semantics, just tagged applicationType=BUSINESS and starting at the company details step. */
    @Transactional
    public LoanApplication createOrResumeBusinessApplication(Long customerId, String email) {
        return repository.findFirstByCustomerIdAndStatusInOrderByUpdatedAtDesc(customerId, ACTIVE_STATUSES)
                .orElseGet(() -> {
                    LoanApplication app = LoanApplication.builder()
                            .applicationRef(generateApplicationRef())
                            .customerId(customerId)
                            .customerEmail(email)
                            .status("DRAFT")
                            .currentSection("companyDetails")
                            .completionPercentage(0)
                            .applicationType("BUSINESS")
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
            creditDeclarations.put("creditScore", 780); // FICO-style bureau score — these are the bank's pre-approved personas
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
                case "guarantorDetails"           -> app.setGuarantorDetailsJson(json);
                case "companyDetails"             -> app.setCompanyDetailsJson(json);
                case "signatories"                -> app.setSignatoriesJson(json);
                case "connectBusinessBank"        -> app.setBusinessBankConnectionJson(json);
                case "businessFinancials"         -> app.setBusinessFinancialsJson(json);
                case "businessOutgoings"          -> app.setBusinessOutgoingsJson(json);
                case "businessCreditDeclarations" -> app.setBusinessCreditDeclarationsJson(json);
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
                case "guarantorDetails"           -> app.setGuarantorDetailsJson(json);
                case "companyDetails"             -> app.setCompanyDetailsJson(json);
                case "signatories"                -> app.setSignatoriesJson(json);
                case "connectBusinessBank"        -> app.setBusinessBankConnectionJson(json);
                case "businessFinancials"         -> app.setBusinessFinancialsJson(json);
                case "businessOutgoings"          -> app.setBusinessOutgoingsJson(json);
                case "businessCreditDeclarations" -> app.setBusinessCreditDeclarationsJson(json);
                default -> throw new IllegalArgumentException("Unknown section: " + section);
            }
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize section data", e);
        }

        repository.save(app);
        auditTrailService.addNote(appRef, section, "Section edited by staff member.", "EDIT", editedBy);
        return app;
    }

    @Transactional
    public LoanApplication submitApplication(String appRef) {
        LoanApplication app = getByRef(appRef);
        app.setStatus("SUBMITTED");
        app.setSubmittedAt(LocalDateTime.now());
        app.setCompletionPercentage(100);
        LoanApplication saved = repository.save(app);
        emailClient.send("SUBMITTED", saved.getCustomerEmail(), text.commonEmailVariables(saved));
        return saved;
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

        decisioningService.maybeAutoApprove(app);
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

    @Transactional
    public LoanApplication cancelApplication(String appRef) {
        LoanApplication app = getByRef(appRef);
        if (!CANCELLABLE_STATUSES.contains(app.getStatus())) {
            throw new IllegalStateException("Application cannot be cancelled in its current status: " + appRef);
        }
        app.setStatus("WITHDRAWN");
        return repository.save(app);
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
            // Skipped by default — only becomes a real stop once an underwriter has flagged
            // guarantorRequired (via DecisioningService.sendBackApplication) and it hasn't been
            // filled in yet.
            case "guarantorDetails"   -> !Boolean.TRUE.equals(app.getGuarantorRequired()) || app.getGuarantorDetailsJson() != null;
            case "companyDetails"             -> app.getCompanyDetailsJson() != null;
            case "signatories"                -> app.getSignatoriesJson() != null;
            case "connectBusinessBank"        -> app.getBusinessBankConnectionJson() != null;
            case "businessFinancials"         -> app.getBusinessFinancialsJson() != null;
            case "businessOutgoings"          -> app.getBusinessOutgoingsJson() != null;
            case "businessCreditDeclarations" -> app.getBusinessCreditDeclarationsJson() != null;
            default -> false;
        };
    }

    private List<String> sectionsFor(LoanApplication app) {
        return "BUSINESS".equals(app.getApplicationType()) ? BUSINESS_SECTIONS : ALL_SECTIONS;
    }

    private int calculateCompletion(LoanApplication app) {
        List<String> sections = sectionsFor(app);
        long filled = sections.stream().filter(section -> isSectionFilled(app, section)).count();
        return (int) (filled * 100 / sections.size());
    }

    /** Normally advances one section at a time. Skips forward over any later section that's
     * already filled in (e.g. pre-filled by the pre-approved fast-track flow), except the
     * permanent MANDATORY_STOPS — so the standard journey is unaffected (every later section is
     * null until reached in order) while a fast-track application jumps straight to the next
     * thing that actually needs the customer's attention. */
    private String nextSection(String currentSection, LoanApplication app) {
        List<String> sections = sectionsFor(app);
        int idx = sections.indexOf(currentSection);
        for (int i = idx + 1; i < sections.size(); i++) {
            String candidate = sections.get(i);
            if (MANDATORY_STOPS.contains(candidate) || !isSectionFilled(app, candidate)) {
                return candidate;
            }
        }
        return sections.get(sections.size() - 1);
    }

    private String generateApplicationRef() {
        int year = Year.now().getValue();
        int seq = 10000 + new Random().nextInt(89999);
        return "DGB-" + year + "-" + seq;
    }
}
