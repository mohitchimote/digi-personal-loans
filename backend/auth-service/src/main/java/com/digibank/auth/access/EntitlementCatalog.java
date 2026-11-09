package com.digibank.auth.access;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The catalog of things a role can be allowed to do. Code defines WHAT can be checked; the admin
 * decides WHICH roles hold each key (the Roles page), with no deploy. This list is a deliberate
 * mirror of worker/src/lib/entitlements.ts: EntitlementCatalogParityTest fails the build if the two
 * drift, so a key added on one side cannot be forgotten on the other.
 */
public final class EntitlementCatalog {

    private EntitlementCatalog() {}

    public static final List<EntitlementDef> ALL = List.of(
        new EntitlementDef("portal.underwriter", "Portals", "Underwriting portal",
                "Lands in the underwriter shell: pipeline, case review and decisioning screens."),
        new EntitlementDef("portal.banker", "Portals", "Banker portal",
                "Lands in the banker shell: banker queue and assisted origination."),
        new EntitlementDef("queue.pipeline", "Queues", "View underwriting pipeline",
                "See submitted cases awaiting a decision (within the role's visibility scope)."),
        new EntitlementDef("queue.banker", "Queues", "View banker queue",
                "See in-progress and submitted cases, including customer drafts, for assistance."),
        new EntitlementDef("dashboard.view", "Queues", "View home dashboard",
                "Home tiles and the action-items / recent-activity panels."),
        new EntitlementDef("case.addNote", "Case actions", "Add case notes",
                "Write notes on an application."),
        new EntitlementDef("case.editSection", "Case actions", "Edit application sections",
                "Edit a section of a customer's application as staff."),
        new EntitlementDef("case.approve", "Case actions", "Approve",
                "Approve an application, subject to the role's approval mandate."),
        new EntitlementDef("case.decline", "Case actions", "Decline",
                "Decline an application."),
        new EntitlementDef("case.sendBack", "Case actions", "Send back / request information",
                "Return an application for clarification or documents."),
        new EntitlementDef("case.refer", "Case actions", "Refer to senior",
                "Escalate an application up the approval chain."),
        new EntitlementDef("case.disburse", "Case actions", "Authorise fund release",
                "First authorisation of disbursement."),
        new EntitlementDef("case.disburseSecondCheck", "Case actions", "Second-check fund release",
                "Second (four-eyes) authorisation of disbursement."),
        new EntitlementDef("case.branchReview", "Case actions", "Branch review",
                "Pass a case to branch review and clear it back to underwriting."),
        new EntitlementDef("case.assign", "Case actions", "Assign and reassign cases",
                "Assign a case to a colleague, move it between people, and see who is eligible."),
        new EntitlementDef("case.resolveVerification", "Case actions", "Resolve data-verification flags",
                "Accept or reject data-verification rule results."),
        new EntitlementDef("case.actAsCustomer", "Case actions", "Act on a customer's behalf",
                "Open and edit a customer's application, and register customers (assisted origination)."),
        new EntitlementDef("mandates.view", "Configuration", "View approval mandates",
                "Read the approval-limit table.")
    );

    public static final Set<String> KEYS = ALL.stream().map(EntitlementDef::key).collect(Collectors.toUnmodifiableSet());

    public static boolean isKnown(String key) {
        return KEYS.contains(key);
    }
}
