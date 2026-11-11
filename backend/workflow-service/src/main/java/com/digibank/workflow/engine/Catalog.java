package com.digibank.workflow.engine;

import java.util.List;
import java.util.Map;

/**
 * What a definition may reference: the entitlement catalog (a mirror of worker/src/lib/entitlements.ts
 * and auth-service's EntitlementCatalog; CatalogParityTest fails if it drifts from the Worker file),
 * and the guard and effect primitives the engine implements.
 */
public final class Catalog {
    private Catalog() {}

    public record Entitlement(String key, String group, String label, String description) {
        public Map<String, Object> toJson() {
            return Js.obj("key", key, "group", group, "label", label, "description", description);
        }
    }

    public static final List<Entitlement> ENTITLEMENTS = List.of(
            new Entitlement("portal.underwriter", "Portals", "Underwriting portal", "Lands in the underwriter shell: pipeline, case review and decisioning screens."),
            new Entitlement("portal.banker", "Portals", "Banker portal", "Lands in the banker shell: banker queue and assisted origination."),
            new Entitlement("queue.pipeline", "Queues", "View underwriting pipeline", "See submitted cases awaiting a decision (within the role's visibility scope)."),
            new Entitlement("queue.banker", "Queues", "View banker queue", "See in-progress and submitted cases, including customer drafts, for assistance."),
            new Entitlement("dashboard.view", "Queues", "View home dashboard", "Home tiles and the action-items / recent-activity panels."),
            new Entitlement("case.addNote", "Case actions", "Add case notes", "Write notes on an application."),
            new Entitlement("case.editSection", "Case actions", "Edit application sections", "Edit a section of a customer's application as staff."),
            new Entitlement("case.approve", "Case actions", "Approve", "Approve an application, subject to the role's approval mandate."),
            new Entitlement("case.decline", "Case actions", "Decline", "Decline an application."),
            new Entitlement("case.sendBack", "Case actions", "Send back / request information", "Return an application for clarification or documents."),
            new Entitlement("case.refer", "Case actions", "Refer to senior", "Escalate an application up the approval chain."),
            new Entitlement("case.disburse", "Case actions", "Authorise fund release", "First authorisation of disbursement."),
            new Entitlement("case.disburseSecondCheck", "Case actions", "Second-check fund release", "Second (four-eyes) authorisation of disbursement."),
            new Entitlement("case.branchReview", "Case actions", "Branch review", "Pass a case to branch review and clear it back to underwriting."),
            new Entitlement("case.assign", "Case actions", "Assign and reassign cases", "Assign a case to a colleague, move it between people, and see who is eligible."),
            new Entitlement("case.resolveVerification", "Case actions", "Resolve data-verification flags", "Accept or reject data-verification rule results."),
            new Entitlement("case.actAsCustomer", "Case actions", "Act on a customer's behalf", "Open and edit a customer's application, and register customers (assisted origination)."),
            new Entitlement("mandates.view", "Configuration", "View approval mandates", "Read the approval-limit table."));

    public static final List<String> ENTITLEMENT_KEYS = ENTITLEMENTS.stream().map(Entitlement::key).toList();

    public static final List<String> GUARDS = List.of("CASE_VISIBLE", "OWNER_OR_ASSISTING", "REFERRAL_LOCK", "AMOUNT_POSITIVE",
            "MANDATE", "REASON_REQUIRED", "TRACK_STATUS_IS", "REFERRAL_TARGET");

    public static final List<String> EFFECTS = List.of("SET", "REFERRAL_OPEN", "REFERRAL_CLOSE", "NOTE", "NOTIFY", "EMAIL",
            "GENERATE_DOC", "CARD_PAYMENT", "PIN_FORM_VERSION", "UNPIN_FORM_VERSION", "RUN_AUTO_APPROVAL");

    public static final List<String> SET_FIELDS = List.of("submittedAt", "completionPercentage", "approvedAmount", "autoApproved",
            "referredToRole", "guarantorRequired", "currentSection");

    public static final List<String> EMAIL_EVENTS = List.of("SUBMITTED", "DOCUMENT_REQUEST", "CLARIFICATION_REQUEST",
            "DECISION_APPROVED", "DECISION_DECLINED", "SEND_BACK", "DISBURSEMENT_AUTHORISED");

    public static final List<String> NOTIFY_TEMPLATES = List.of("DECISION_DECLINED", "SEND_BACK", "DECISION_APPROVED",
            "DISBURSEMENT_AUTHORISED", "CLARIFICATION_REQUEST", "DOCUMENT_REQUEST");

    /** The GET /catalog response body. */
    public static Map<String, Object> catalogJson() {
        return Js.obj("entitlements", ENTITLEMENTS.stream().map(Entitlement::toJson).toList(),
                "guards", GUARDS, "effects", EFFECTS, "setFields", SET_FIELDS,
                "emailEvents", EMAIL_EVENTS, "notifyTemplates", NOTIFY_TEMPLATES);
    }
}
