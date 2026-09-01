package com.digibank.application.businessfinancials;

import com.digibank.application.businessfinancials.dto.BusinessFinancialsAnalysis;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

/**
 * Business-financials-intelligence context (ARCHITECTURE.md §10) — thin orchestrator (generate
 * once, persist, return on subsequent reads); generation itself is delegated to
 * BusinessFinancialsPort so this class doesn't change when the simulator is replaced by a real
 * integration.
 */
@Service
public class BusinessFinancialsAnalysisService {

    private final LoanApplicationRepository repository;
    private final ObjectMapper objectMapper;
    private final BusinessFinancialsPort port;

    public BusinessFinancialsAnalysisService(LoanApplicationRepository repository, ObjectMapper objectMapper, BusinessFinancialsPort port) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.port = port;
    }

    public BusinessFinancialsAnalysis getOrGenerate(String appRef) {
        LoanApplication app = getByRef(appRef);
        if (app.getBusinessFinancialsAnalysisJson() != null) {
            return deserialize(app.getBusinessFinancialsAnalysisJson());
        }
        BusinessFinancialsAnalysis analysis = port.generate(app);
        persist(app, analysis);
        return analysis;
    }

    private BusinessFinancialsAnalysis deserialize(String json) {
        try {
            return objectMapper.readValue(json, BusinessFinancialsAnalysis.class);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize business financials analysis", e);
        }
    }

    private void persist(LoanApplication app, BusinessFinancialsAnalysis analysis) {
        try {
            app.setBusinessFinancialsAnalysisJson(objectMapper.writeValueAsString(analysis));
            repository.save(app);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize business financials analysis", e);
        }
    }

    private LoanApplication getByRef(String appRef) {
        return repository.findByApplicationRef(appRef)
                .orElseThrow(() -> new IllegalArgumentException("Application not found: " + appRef));
    }
}
