package com.digibank.application.client;

import com.digibank.application.model.LoanApplication;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

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
