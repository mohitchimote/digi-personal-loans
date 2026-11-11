package com.digibank.application.workflow;

import com.digibank.application.client.AffordabilityClient;
import com.digibank.application.model.LoanApplication;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Whether a case that has just had its product selected is approved by the system, and for how much. The workflow
 * definition only says "after select_product, run auto-approval" (the RUN_AUTO_APPROVAL effect); the threshold
 * check belongs to the affordability rules and is host logic, as in the Worker's maybeAutoApprove. The decision
 * itself (state change, notes, notifications) is the engine's auto_approve action, run by {@link WorkflowActions}.
 * Any failure means "not auto-approved": the case falls back to manual underwriter review.
 */
@Component
public class AutoApprovalPolicy {

    private final AffordabilityClient affordability;
    private final ObjectMapper mapper;

    public AutoApprovalPolicy(AffordabilityClient affordability, ObjectMapper mapper) {
        this.affordability = affordability;
        this.mapper = mapper;
    }

    public Optional<BigDecimal> approvedAmountFor(LoanApplication app) {
        try {
            // Business loans always go to manual review for now: the threshold is sized for personal loans and reads
            // loanRequirementsJson, which business applications never populate.
            if ("BUSINESS".equals(app.getApplicationType())) return Optional.empty();
            if (app.getAffordabilityResultJson() == null) return Optional.empty();
            if (!mapper.readTree(app.getAffordabilityResultJson()).path("passed").asBoolean(false)) return Optional.empty();

            JsonNode personal = app.getPersonalDetailsJson() != null ? mapper.readTree(app.getPersonalDetailsJson()) : null;
            boolean joint = personal != null && personal.has("applicant2") && !personal.get("applicant2").isNull();
            BigDecimal threshold = affordability.getAutoApprovalThreshold(joint);
            if (threshold == null) return Optional.empty();

            JsonNode loan = app.getLoanRequirementsJson() != null ? mapper.readTree(app.getLoanRequirementsJson()) : null;
            BigDecimal amount = BigDecimal.valueOf(loan != null ? loan.path("loanAmount").asDouble(0) : 0);
            return amount.compareTo(threshold) > 0 ? Optional.empty() : Optional.of(amount);
        } catch (Exception e) {
            return Optional.empty();
        }
    }
}
