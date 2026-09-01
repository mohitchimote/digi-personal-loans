package com.digibank.application.client;

import com.digibank.application.model.LoanApplication;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Small formatting helpers for customer-facing notification text, shared by decisioning
 * (decline/send-back/approve/authorise) and audittrail (clarification/document-request notes) —
 * the two contexts that actually send notifications. Not a domain of its own, same as the rest of
 * this `client` package (ARCHITECTURE.md §10).
 */
@Component
public class NotificationText {

    private final ObjectMapper objectMapper;

    public NotificationText(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String greeting(LoanApplication app) {
        return "Dear " + applicantFirstName(app) + ",";
    }

    /** Ports worker/src/lib/app-format.ts's applicantFirstName exactly — the bare name (or
     * "Customer" fallback), needed as-is (not the "Dear X," wrapper) for the email templates'
     * applicantName variable (PRODUCTION_READINESS.md §6). */
    public String applicantFirstName(LoanApplication app) {
        try {
            if (app.getPersonalDetailsJson() != null) {
                JsonNode node = objectMapper.readTree(app.getPersonalDetailsJson());
                if (node.has("firstName") && !node.get("firstName").asText().isBlank()) {
                    return node.get("firstName").asText();
                }
            }
        } catch (Exception ignored) { }
        return "Customer";
    }

    public String loanPurpose(LoanApplication app) {
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

    /** The COMMON_VARIABLES every email template event gets, ported from worker's
     * email-events.ts — event-specific extras are added on top by each call site. HashMap, not
     * Map.of(): loanPurpose/applicantFirstName always return a non-null fallback string, but a
     * mutable map keeps this consistent with the rest of the codebase's null-safety convention. */
    public Map<String, String> commonEmailVariables(LoanApplication app) {
        Map<String, String> variables = new HashMap<>();
        variables.put("applicantName", applicantFirstName(app));
        variables.put("applicationRef", app.getApplicationRef());
        variables.put("loanPurpose", loanPurpose(app));
        return variables;
    }

    public String sectionLabel(String section) {
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
            case "guarantorDetails"   -> "Guarantor Details";
            default -> "application";
        };
    }
}
