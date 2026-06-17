package com.digibank.application.service;

import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
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
    private final ObjectMapper objectMapper;

    public ApplicationService(LoanApplicationRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    private static final List<String> ACTIVE_STATUSES = List.of("DRAFT", "IN_PROGRESS");
    private static final List<String> ALL_SECTIONS = List.of(
            "loanRequirements", "personalDetails", "incomeEmployment",
            "outgoings", "creditDeclarations", "reviewSubmit"
    );

    @Transactional
    public LoanApplication createOrResumeApplication(Long customerId, String email) {
        return repository.findFirstByCustomerIdAndStatusInOrderByCreatedAtDesc(customerId, ACTIVE_STATUSES)
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
                case "personalDetails"    -> app.setPersonalDetailsJson(json);
                case "incomeEmployment"   -> app.setIncomeEmploymentJson(json);
                case "outgoings"          -> app.setOutgoingsJson(json);
                case "creditDeclarations" -> app.setCreditDeclarationsJson(json);
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
    public LoanApplication submitApplication(String appRef) {
        LoanApplication app = getByRef(appRef);
        app.setStatus("SUBMITTED");
        app.setSubmittedAt(LocalDateTime.now());
        app.setCompletionPercentage(100);
        return repository.save(app);
    }

    @Transactional
    public LoanApplication selectProduct(String appRef, String productId) {
        LoanApplication app = getByRef(appRef);
        app.setSelectedProductId(productId);
        app.setStatus("UNDER_REVIEW");
        return repository.save(app);
    }

    @Transactional
    public LoanApplication approveApplication(String appRef) {
        LoanApplication app = getByRef(appRef);
        app.setStatus("APPROVED");
        return repository.save(app);
    }

    public LoanApplication getApplication(String appRef) {
        return getByRef(appRef);
    }

    public List<LoanApplication> getApplicationsByCustomer(Long customerId) {
        return repository.findByCustomerIdOrderByCreatedAtDesc(customerId);
    }

    private LoanApplication getByRef(String appRef) {
        return repository.findByApplicationRef(appRef)
                .orElseThrow(() -> new IllegalArgumentException("Application not found: " + appRef));
    }

    private int calculateCompletion(LoanApplication app) {
        long filled = ALL_SECTIONS.stream().filter(section -> switch (section) {
            case "loanRequirements"   -> app.getLoanRequirementsJson() != null;
            case "personalDetails"    -> app.getPersonalDetailsJson() != null;
            case "incomeEmployment"   -> app.getIncomeEmploymentJson() != null;
            case "outgoings"          -> app.getOutgoingsJson() != null;
            case "creditDeclarations" -> app.getCreditDeclarationsJson() != null;
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
