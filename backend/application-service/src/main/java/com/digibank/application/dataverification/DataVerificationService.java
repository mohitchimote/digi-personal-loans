package com.digibank.application.dataverification;

import com.digibank.application.dataverification.dto.DataVerificationResolution;
import com.digibank.application.dataverification.dto.DataVerificationResolutionRequest;
import com.digibank.application.dataverification.dto.DataVerificationRule;
import com.digibank.application.dataverification.dto.DataVerificationSummary;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Data-verification context (ARCHITECTURE.md §10) — orchestrates the discrepancy-check lifecycle
 * (generate once, persist, let staff resolve flagged rules). Generation itself is delegated to
 * DataVerificationPort so this class doesn't change when the simulator is replaced by a real
 * integration.
 */
@Service
public class DataVerificationService {

    private final LoanApplicationRepository repository;
    private final ObjectMapper objectMapper;
    private final DataVerificationPort port;

    public DataVerificationService(LoanApplicationRepository repository, ObjectMapper objectMapper, DataVerificationPort port) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.port = port;
    }

    public DataVerificationSummary getOrGenerate(String appRef) {
        LoanApplication app = getByRef(appRef);
        if (app.getDataVerificationJson() != null) {
            return deserialize(app.getDataVerificationJson());
        }
        DataVerificationSummary summary = port.generate(app);
        persist(app, summary);
        return summary;
    }

    @Transactional
    public DataVerificationSummary resolveRule(String appRef, DataVerificationResolutionRequest request) {
        LoanApplication app = getByRef(appRef);
        DataVerificationSummary summary = app.getDataVerificationJson() != null
                ? deserialize(app.getDataVerificationJson())
                : port.generate(app);

        if ("APPROVE_EXCEPTION".equals(request.getAction()) && isBlank(request.getNote())) {
            throw new IllegalArgumentException("A note is required to approve as an exception.");
        }

        DataVerificationRule rule = summary.getRules().stream()
                .filter(r -> r.getRuleKey().equals(request.getRuleKey()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown data verification rule: " + request.getRuleKey()));

        DataVerificationResolution resolution = new DataVerificationResolution();
        resolution.setAction(request.getAction());
        resolution.setNote(request.getNote());
        resolution.setReviewedBy(request.getReviewedBy());
        resolution.setResolvedAt(LocalDateTime.now().toString());
        rule.setResolution(resolution);

        persist(app, summary);
        return summary;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private DataVerificationSummary deserialize(String json) {
        try {
            return objectMapper.readValue(json, DataVerificationSummary.class);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize data verification summary", e);
        }
    }

    private void persist(LoanApplication app, DataVerificationSummary summary) {
        try {
            app.setDataVerificationJson(objectMapper.writeValueAsString(summary));
            repository.save(app);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize data verification summary", e);
        }
    }

    private LoanApplication getByRef(String appRef) {
        return repository.findByApplicationRef(appRef)
                .orElseThrow(() -> new IllegalArgumentException("Application not found: " + appRef));
    }
}
