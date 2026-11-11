package com.digibank.application.wizard;

import com.digibank.application.client.ProductClient;
import com.digibank.application.formbuilder.FormConditions;
import com.digibank.application.formbuilder.FormVersion;
import com.digibank.application.formbuilder.FormVersionService;
import com.digibank.application.formbuilder.SectionColumns;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.security.AuthenticatedUser;
import com.digibank.application.workflow.IdempotencyKeys;
import com.digibank.application.workflow.WorkflowActions;
import com.digibank.application.workflow.WorkflowActions.Run;
import com.digibank.application.workflow.WorkflowActor;
import com.digibank.application.workflow.WorkflowCases;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Year;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * Wizard/section-engine context (ARCHITECTURE.md §10) — section save/read, skip-forward mechanic,
 * start/resume, joint-applicant handling. Every change of a case's state (section save, submit, withdraw, cancel,
 * select-product, an underwriter's section edit) is a workflow action run through WorkflowActions: the data the
 * wizard owns (a section, the chosen product) is written in the same transaction as the action, and the engine in
 * workflow-service decides whether it is allowed and what else it does (status, form-version pin, emails, auto-approval).
 * Cases are registered with workflow-service when they are created.
 */
@Service
public class WizardService {

    private final LoanApplicationRepository repository;
    private final ObjectMapper objectMapper;
    private final ProductClient productClient;
    private final WorkflowActions actions;
    private final WorkflowCases workflowCases;

    private static final List<String> ACTIVE_STATUSES = List.of("DRAFT", "IN_PROGRESS");

    /** A saved section from which the case summary workflow-service lists queues from (applicant, amount, purpose, term, guarantor) can change. */
    private static final Set<String> SUMMARY_SECTIONS = Set.of("loanRequirements", "companyDetails", "personalDetails", "guarantorDetails");

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

    private final SectionDataValidator sectionDataValidator;
    private final FormVersionService formVersionService;

    public WizardService(LoanApplicationRepository repository, ObjectMapper objectMapper, ProductClient productClient,
                          WorkflowActions actions, WorkflowCases workflowCases,
                          SectionDataValidator sectionDataValidator, FormVersionService formVersionService) {
        this.formVersionService = formVersionService;
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.productClient = productClient;
        this.actions = actions;
        this.workflowCases = workflowCases;
        this.sectionDataValidator = sectionDataValidator;
    }

    private LoanApplication created(LoanApplication app) {
        LoanApplication saved = repository.save(app);
        workflowCases.registerAfterCommit(saved);
        return saved;
    }

    @Transactional
    public LoanApplication createOrResumeApplication(Long customerId, String email, Long orgUnitId) {
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
                            .orgUnitId(orgUnitId)
                            .build();
                    return created(app);
                });
    }

    /** Business-loan equivalent of createOrResumeApplication — same resume-an-active-draft
     * semantics, just tagged applicationType=BUSINESS and starting at the company details step. */
    @Transactional
    public LoanApplication createOrResumeBusinessApplication(Long customerId, String email, Long orgUnitId) {
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
                            .orgUnitId(orgUnitId)
                            .build();
                    return created(app);
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
        LoanApplication saved = created(app);
        productClient.consumePreApprovedOffer(nationalId);
        return saved;
    }

    private Run run(String action, AuthenticatedUser caller) {
        return Run.of(action, WorkflowActor.of(caller)).withKey(IdempotencyKeys.current());
    }

    /** Pushes the case summary (applicant, amount, purpose, term) to workflow-service after a change that can alter it. Best effort. */
    private LoanApplication summarise(LoanApplication app, String section) {
        if (section == null || SUMMARY_SECTIONS.contains(section)) workflowCases.registerAfterCommit(app);
        return app;
    }

    /** The section's data, the next section and the completion are written in the same transaction as the save_section action. */
    public LoanApplication saveSection(String appRef, AuthenticatedUser caller, String section, Map<String, Object> data) {
        LoanApplication app = getByRef(appRef);
        String json = validateSection(app, section, data);
        LoanApplication saved = actions.run(appRef, run("save_section", caller).withApply(a -> {
            SectionColumns.write(a, section, json);
            a.setCurrentSection(nextSection(section, a));
            a.setCompletionPercentage(calculateCompletion(a));
        })).application();
        return summarise(saved, section);
    }

    /** An underwriter's edit: the edit_section action leaves its note; the section is written in the same transaction. */
    public LoanApplication saveSectionByUnderwriter(String appRef, AuthenticatedUser caller, String section, Map<String, Object> data) {
        LoanApplication app = getByRef(appRef);
        String json = validateSection(app, section, data);
        LoanApplication saved = actions.run(appRef, run("edit_section", caller).withInput(Map.of("section", section))
                .withApply(a -> SectionColumns.write(a, section, json))).application();
        return summarise(saved, section);
    }

    public LoanApplication submitApplication(String appRef, AuthenticatedUser caller) {
        return summarise(actions.run(appRef, run("submit", caller)).application(), null);
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

    /**
     * The chosen product is written in the same transaction as the select_product action; if the affordability result
     * passed and the amount is within the auto-approval threshold the engine's RUN_AUTO_APPROVAL effect then approves the
     * case (the system's auto_approve action), so the case returned may already be APPROVED, as in the Worker.
     */
    public LoanApplication selectProduct(String appRef, AuthenticatedUser caller, Map<String, Object> productData) {
        Object productId = productData.get("productId");
        String json;
        try {
            json = objectMapper.writeValueAsString(productData);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize product data", e);
        }
        return actions.run(appRef, run("select_product", caller).withApply(a -> {
            a.setSelectedProductId(productId == null ? "" : String.valueOf(productId));
            a.setSelectedProductJson(json);
        })).application();
    }

    public LoanApplication getApplication(String appRef) {
        return getByRef(appRef);
    }

    /**
     * The application as GET /:appRef and GET /customer/:id/current serve it: every column, plus what the
     * wizard and sidebar need to render schema-aware (resolvedFormVersion, formSchema,
     * needsAttentionSections), from the version the case is judged against.
     */
    public Map<String, Object> view(LoanApplication app) {
        @SuppressWarnings("unchecked")
        Map<String, Object> out = new LinkedHashMap<>(objectMapper.convertValue(app, Map.class));
        FormVersion version = formVersionService.resolveActive(app).orElse(null);
        if (version == null) {
            out.put("resolvedFormVersion", null);
            out.put("formSchema", null);
            out.put("needsAttentionSections", List.of());
            return out;
        }
        JsonNode schema = formVersionService.parse(version);
        Map<String, Object> resolved = new LinkedHashMap<>();
        resolved.put("id", version.getId());
        resolved.put("version", version.getVersion());
        resolved.put("status", version.getStatus());
        out.put("resolvedFormVersion", resolved);
        out.put("formSchema", schema == null ? null : objectMapper.convertValue(schema, Object.class));
        out.put("needsAttentionSections", SectionColumns.needsAttentionSections(app, schema, objectMapper, this::isSectionFilled));
        return out;
    }

    /**
     * Validates a section save against the section's fixed shape and the form version in force: a port of
     * validateSectionData in worker/src/routes/applications.ts. Admin-added custom fields are split out
     * before the strict static shape runs and merged back after; required, visible fields and option lists
     * are then enforced across every schema field. Returns the JSON to persist.
     */
    String validateSection(LoanApplication app, String section, Map<String, Object> data) {
        if (!SectionColumns.isKnown(section)) throw new IllegalArgumentException("Unknown section: " + section);

        JsonNode schema = formVersionService.resolveActive(app).map(formVersionService::parse).orElse(null);
        List<JsonNode> schemaFields = new java.util.ArrayList<>();
        if (schema != null) {
            for (JsonNode s : schema.path("sections")) {
                if (section.equals(s.path("key").asText())) s.path("fields").forEach(schemaFields::add);
            }
        }

        Map<String, Object> staticData = new LinkedHashMap<>(data);
        Map<String, Object> customData = new LinkedHashMap<>();
        for (JsonNode f : schemaFields) {
            String key = f.path("key").asText();
            if ("custom".equals(f.path("kind").asText()) && staticData.containsKey(key)) customData.put(key, staticData.remove(key));
        }

        String json = sectionDataValidator.validateAndSerialize(section, staticData);
        ObjectNode merged;
        try {
            merged = (ObjectNode) objectMapper.readTree(json);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to read validated section data", e);
        }
        customData.forEach((k, v) -> merged.set(k, objectMapper.valueToTree(v)));
        if (schemaFields.isEmpty()) return merged.toString();

        Map<String, Object> cross = SectionColumns.flattenAllSectionValues(app, objectMapper);
        merged.fields().forEachRemaining(e -> cross.put(section + "." + e.getKey(), SectionColumns.plain(objectMapper, e.getValue())));
        FormConditions.Context ctx = new FormConditions.Context(schema.get("constants"), cross);

        for (JsonNode f : schemaFields) {
            String key = f.path("key").asText();
            boolean visible = !f.path("hidden").asBoolean(false) && FormConditions.isFieldVisible(f, section, ctx);
            JsonNode value = merged.get(key);
            boolean empty = value == null || value.isNull() || (value.isTextual() && value.asText().isEmpty());

            if (f.path("required").asBoolean(false) && visible && empty) {
                throw new IllegalArgumentException("Missing required field '" + key + "' for section '" + section + "'.");
            }
            JsonNode options = f.get("options");
            if (visible && options != null && options.size() > 0 && !empty) {
                java.util.Set<String> allowed = new java.util.HashSet<>();
                JsonNode dep = f.get("optionsDependOn");
                if (dep != null) {
                    Object trigger = cross.get(section + "." + dep.path("fieldKey").asText());
                    allowed.addAll(FormConditions.strings(dep.path("map").get(trigger == null ? "" : FormConditions.str(trigger))));
                } else {
                    options.forEach(o -> allowed.add(o.path("value").asText()));
                }
                if (!allowed.contains(FormConditions.str(SectionColumns.plain(objectMapper, value)))) {
                    throw new IllegalArgumentException("Invalid value for field '" + key + "' in section '" + section + "'.");
                }
            }
        }
        return merged.toString();
    }

    public List<LoanApplication> getApplicationsByCustomer(Long customerId) {
        return repository.findByCustomerIdOrderByCreatedAtDesc(customerId);
    }

    public LoanApplication getCurrentApplication(Long customerId) {
        return repository.findFirstByCustomerIdOrderByUpdatedAtDesc(customerId)
                .orElseThrow(() -> new IllegalArgumentException("No application found for customer: " + customerId));
    }

    public LoanApplication withdrawApplication(String appRef, AuthenticatedUser caller) {
        return actions.run(appRef, run("withdraw", caller)).application();
    }

    public LoanApplication cancelApplication(String appRef, AuthenticatedUser caller) {
        return actions.run(appRef, run("cancel", caller)).application();
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
