package com.digibank.application.workflow;

import com.digibank.application.model.LoanApplication;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * What application-service tells workflow-service about a case: the small summary it lists queues from, the
 * host-owned fields the engine reads, and (on first sight, or in a backfill) the case's current status.
 */
@Component
public class CaseSummaries {

    private static final DateTimeFormatter ISO_MILLIS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(java.time.ZoneOffset.UTC);

    private final ObjectMapper mapper;

    public CaseSummaries(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    private JsonNode json(String s) {
        try {
            return s == null ? null : mapper.readTree(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static String text(JsonNode n, String field) {
        return n != null && n.hasNonNull(field) && !n.get(field).asText().isBlank() ? n.get(field).asText() : null;
    }

    /** The loan's amount, purpose and term live in loanRequirements for a personal case and in companyDetails for a business one. */
    private JsonNode loanSource(LoanApplication app) {
        return json("BUSINESS".equals(app.getApplicationType()) ? app.getCompanyDetailsJson() : app.getLoanRequirementsJson());
    }

    private String applicantName(LoanApplication app) {
        if ("BUSINESS".equals(app.getApplicationType())) return text(json(app.getCompanyDetailsJson()), "companyName");
        JsonNode p = json(app.getPersonalDetailsJson());
        String first = text(p, "firstName"), last = text(p, "lastName");
        String full = ((first == null ? "" : first) + " " + (last == null ? "" : last)).trim();
        return full.isEmpty() ? null : full;
    }

    /** Summary and engine fields. Always sent whole, so an update after any change leaves nothing stale. */
    public Map<String, Object> summaryOf(LoanApplication app) {
        JsonNode loan = loanSource(app);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("applicationType", "BUSINESS".equals(app.getApplicationType()) ? "BUSINESS" : "PERSONAL");
        m.put("orgUnitId", app.getOrgUnitId());
        m.put("customerId", app.getCustomerId());
        m.put("applicantName", applicantName(app));
        m.put("amount", loan != null && loan.hasNonNull("loanAmount") ? loan.get("loanAmount").asDouble() : null);
        m.put("purpose", text(loan, "loanPurpose"));
        m.put("termMonths", loan != null && loan.hasNonNull("loanTerm") ? loan.get("loanTerm").asInt() : null);
        m.put("referredToRole", app.getReferredToRole());
        m.put("approvedAmount", app.getApprovedAmount() == null ? null : app.getApprovedAmount().doubleValue());
        m.put("guarantorRequired", Boolean.TRUE.equals(app.getGuarantorRequired()));
        m.put("guarantorDetailsPresent", app.getGuarantorDetailsJson() != null);
        m.put("currentSection", app.getCurrentSection());
        return m;
    }

    /** The summary plus where the case is now, for a first registration. enteredAt is when it last changed. */
    public Map<String, Object> registrationOf(LoanApplication app) {
        Map<String, Object> m = summaryOf(app);
        m.put("status", app.getStatus());
        m.put("disbursementStatus", app.getDisbursementStatus());
        LocalDateTime changed = app.getUpdatedAt() != null ? app.getUpdatedAt() : app.getCreatedAt();
        if (changed != null) m.put("enteredAt", iso(changed));
        m.put("applicationRef", app.getApplicationRef());
        return m;
    }

    /**
     * The fields the engine reads, sent with every evaluate so it judges the application as it is now (referral lock,
     * approved amount, guarantor flags) rather than as of the last summary update.
     */
    public Map<String, Object> fieldsOf(LoanApplication app) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("referredToRole", app.getReferredToRole());
        f.put("approvedAmount", app.getApprovedAmount() == null ? null : app.getApprovedAmount().doubleValue());
        f.put("guarantorRequired", Boolean.TRUE.equals(app.getGuarantorRequired()));
        f.put("guarantorDetailsPresent", app.getGuarantorDetailsJson() != null);
        f.put("currentSection", app.getCurrentSection());
        return f;
    }

    public static String iso(LocalDateTime t) {
        return ISO_MILLIS.format(t.atZone(ZoneId.systemDefault()).toInstant());
    }

    /** Parses a workflow timestamp ("2026-11-11T10:00:00.000Z") into the application's local date-time, or now if it is not one. */
    public static LocalDateTime parseIso(Object v) {
        try {
            return LocalDateTime.ofInstant(Instant.parse(String.valueOf(v)), ZoneId.systemDefault());
        } catch (DateTimeException e) {
            return LocalDateTime.now();
        }
    }
}
