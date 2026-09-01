package com.digibank.notification.email;

import com.digibank.notification.email.dto.EmailEventMeta;
import com.digibank.notification.email.dto.EmailVariable;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Single source of truth for which lifecycle events can have an email template — ports
 * worker/src/lib/email-events.ts exactly (EVENT_REGISTRY, EVENT_KEYS, SAMPLE_VARIABLES).
 */
public final class EventRegistry {
    private EventRegistry() {}

    private static final List<EmailVariable> COMMON_VARIABLES = List.of(
            new EmailVariable("applicantName", "The applicant's first name"),
            new EmailVariable("applicationRef", "The application reference number"),
            new EmailVariable("loanPurpose", "The stated purpose of the loan")
    );

    public static final Map<String, EmailEventMeta> EVENT_REGISTRY = buildRegistry();

    private static Map<String, EmailEventMeta> buildRegistry() {
        Map<String, EmailEventMeta> registry = new LinkedHashMap<>();

        registry.put("SUBMITTED", new EmailEventMeta("SUBMITTED", "Application Submitted",
                "Sent to the applicant right after they submit their application.",
                COMMON_VARIABLES));

        registry.put("DOCUMENT_REQUEST", new EmailEventMeta("DOCUMENT_REQUEST", "Document Requested",
                "Sent when an underwriter requests an additional document.",
                withExtra(new EmailVariable("underwriterNote", "The underwriter's note explaining what's needed"),
                        new EmailVariable("sectionName", "The application section under review"))));

        registry.put("CLARIFICATION_REQUEST", new EmailEventMeta("CLARIFICATION_REQUEST", "Clarification Requested",
                "Sent when an underwriter requests clarification on a section.",
                withExtra(new EmailVariable("underwriterNote", "The underwriter's note explaining what's needed"),
                        new EmailVariable("sectionName", "The application section under review"))));

        registry.put("DECISION_APPROVED", new EmailEventMeta("DECISION_APPROVED", "Application Approved",
                "Sent when an underwriter fully approves the application.",
                withExtra(new EmailVariable("approvedAmount", "The approved loan amount"),
                        new EmailVariable("reviewedBy", "The name of the reviewing staff member"))));

        registry.put("DECISION_DECLINED", new EmailEventMeta("DECISION_DECLINED", "Application Declined",
                "Sent when an underwriter declines the application.",
                withExtra(new EmailVariable("declineReason", "The reason given for declining"),
                        new EmailVariable("reviewedBy", "The name of the reviewing staff member"))));

        registry.put("SEND_BACK", new EmailEventMeta("SEND_BACK", "Sent Back for Revision",
                "Sent when an underwriter sends the application back for more details.",
                withExtra(new EmailVariable("sendBackReason", "The underwriter's note on what needs revising"),
                        new EmailVariable("reviewedBy", "The name of the reviewing staff member"),
                        new EmailVariable("guarantorRequiredNote", "Extra sentence shown only if a guarantor is newly required"))));

        registry.put("DISBURSEMENT_AUTHORISED", new EmailEventMeta("DISBURSEMENT_AUTHORISED", "Funds Released",
                "Sent when loan funds are authorised for release.",
                withExtra(new EmailVariable("reviewedBy", "The name of the authorising staff member"))));

        return registry;
    }

    private static List<EmailVariable> withExtra(EmailVariable... extra) {
        List<EmailVariable> combined = new java.util.ArrayList<>(COMMON_VARIABLES);
        combined.addAll(List.of(extra));
        return combined;
    }

    public static final List<String> EVENT_KEYS = List.copyOf(EVENT_REGISTRY.keySet());

    public static boolean isKnownEventKey(String key) {
        return EVENT_REGISTRY.containsKey(key);
    }

    // Fixed sample values for the admin's "preview" and "send test" actions — one flat set
    // covering every variable used across all events.
    public static final Map<String, String> SAMPLE_VARIABLES = Map.ofEntries(
            Map.entry("applicantName", "Jane"),
            Map.entry("applicationRef", "PL-DEMO-0001"),
            Map.entry("loanPurpose", "home renovation"),
            Map.entry("underwriterNote", "Please upload your latest 3 months of payslips."),
            Map.entry("sectionName", "Income & Employment"),
            Map.entry("approvedAmount", "45,000"),
            Map.entry("reviewedBy", "Alex Cohen"),
            Map.entry("declineReason", "Affordability check did not meet the minimum threshold."),
            Map.entry("sendBackReason", "Please confirm your current employer's contact details."),
            Map.entry("guarantorRequiredNote",
                    " A guarantor is now required for this application — please complete the new Guarantor Details section, "
                            + "including a supporting document for your guarantor, before resubmitting.")
    );
}
