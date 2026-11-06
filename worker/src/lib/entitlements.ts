// Phase 2 - the catalog of things a role can be allowed to do. Code defines WHAT can be checked
// (adding a key here + one assertEntitlement call is the only code change a new capability needs);
// the admin decides WHICH roles hold each key, in the Roles page, with no deploy.

export interface EntitlementDef {
  key: string;
  group: "Portals" | "Queues" | "Case actions" | "Configuration";
  label: string;
  description: string;
}

export const ENTITLEMENT_CATALOG: EntitlementDef[] = [
  { key: "portal.underwriter", group: "Portals", label: "Underwriting portal", description: "Lands in the underwriter shell: pipeline, case review and decisioning screens." },
  { key: "portal.banker", group: "Portals", label: "Banker portal", description: "Lands in the banker shell: banker queue and assisted origination." },

  { key: "queue.pipeline", group: "Queues", label: "View underwriting pipeline", description: "See submitted cases awaiting a decision (within the role's visibility scope)." },
  { key: "queue.banker", group: "Queues", label: "View banker queue", description: "See in-progress and submitted cases, including customer drafts, for assistance." },
  { key: "dashboard.view", group: "Queues", label: "View home dashboard", description: "Home tiles and the action-items / recent-activity panels." },

  { key: "case.addNote", group: "Case actions", label: "Add case notes", description: "Write notes on an application." },
  { key: "case.editSection", group: "Case actions", label: "Edit application sections", description: "Edit a section of a customer's application as staff." },
  { key: "case.approve", group: "Case actions", label: "Approve", description: "Approve an application, subject to the role's approval mandate." },
  { key: "case.decline", group: "Case actions", label: "Decline", description: "Decline an application." },
  { key: "case.sendBack", group: "Case actions", label: "Send back / request information", description: "Return an application for clarification or documents." },
  { key: "case.refer", group: "Case actions", label: "Refer to senior", description: "Escalate an application up the approval chain." },
  { key: "case.disburse", group: "Case actions", label: "Authorise fund release", description: "First authorisation of disbursement." },
  { key: "case.disburseSecondCheck", group: "Case actions", label: "Second-check fund release", description: "Second (four-eyes) authorisation of disbursement." },
  { key: "case.resolveVerification", group: "Case actions", label: "Resolve data-verification flags", description: "Accept or reject data-verification rule results." },
  { key: "case.actAsCustomer", group: "Case actions", label: "Act on a customer's behalf", description: "Open and edit a customer's application, and register customers (assisted origination)." },

  { key: "mandates.view", group: "Configuration", label: "View approval mandates", description: "Read the approval-limit table." },
];

export const ENTITLEMENT_KEYS = ENTITLEMENT_CATALOG.map((e) => e.key);

export const SCOPES = ["ALL", "UNIT_TREE", "UNIT_ONLY"] as const;
export type Scope = (typeof SCOPES)[number];
