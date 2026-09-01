// Single source of truth for which lifecycle events can have an email template — consumed by the
// admin router (dropdown + variable-tag chips) and by email.ts (which variables are valid to
// substitute). Every eventKey here gets a lazily-seeded row in the email_templates table.

export interface EmailVariable {
  name: string;
  description: string;
}

export interface EmailEventMeta {
  eventKey: string;
  label: string;
  description: string;
  variables: EmailVariable[];
}

const COMMON_VARIABLES: EmailVariable[] = [
  { name: "applicantName", description: "The applicant's first name" },
  { name: "applicationRef", description: "The application reference number" },
  { name: "loanPurpose", description: "The stated purpose of the loan" },
];

export const EVENT_REGISTRY: Record<string, EmailEventMeta> = {
  SUBMITTED: {
    eventKey: "SUBMITTED",
    label: "Application Submitted",
    description: "Sent to the applicant right after they submit their application.",
    variables: [...COMMON_VARIABLES],
  },
  DOCUMENT_REQUEST: {
    eventKey: "DOCUMENT_REQUEST",
    label: "Document Requested",
    description: "Sent when an underwriter requests an additional document.",
    variables: [
      ...COMMON_VARIABLES,
      { name: "underwriterNote", description: "The underwriter's note explaining what's needed" },
      { name: "sectionName", description: "The application section under review" },
    ],
  },
  CLARIFICATION_REQUEST: {
    eventKey: "CLARIFICATION_REQUEST",
    label: "Clarification Requested",
    description: "Sent when an underwriter requests clarification on a section.",
    variables: [
      ...COMMON_VARIABLES,
      { name: "underwriterNote", description: "The underwriter's note explaining what's needed" },
      { name: "sectionName", description: "The application section under review" },
    ],
  },
  DECISION_APPROVED: {
    eventKey: "DECISION_APPROVED",
    label: "Application Approved",
    description: "Sent when an underwriter fully approves the application.",
    variables: [
      ...COMMON_VARIABLES,
      { name: "approvedAmount", description: "The approved loan amount" },
      { name: "reviewedBy", description: "The name of the reviewing staff member" },
    ],
  },
  DECISION_DECLINED: {
    eventKey: "DECISION_DECLINED",
    label: "Application Declined",
    description: "Sent when an underwriter declines the application.",
    variables: [
      ...COMMON_VARIABLES,
      { name: "declineReason", description: "The reason given for declining" },
      { name: "reviewedBy", description: "The name of the reviewing staff member" },
    ],
  },
  SEND_BACK: {
    eventKey: "SEND_BACK",
    label: "Sent Back for Revision",
    description: "Sent when an underwriter sends the application back for more details.",
    variables: [
      ...COMMON_VARIABLES,
      { name: "sendBackReason", description: "The underwriter's note on what needs revising" },
      { name: "reviewedBy", description: "The name of the reviewing staff member" },
      { name: "guarantorRequiredNote", description: "Extra sentence shown only if a guarantor is newly required" },
    ],
  },
  DISBURSEMENT_AUTHORISED: {
    eventKey: "DISBURSEMENT_AUTHORISED",
    label: "Funds Released",
    description: "Sent when loan funds are authorised for release.",
    variables: [...COMMON_VARIABLES, { name: "reviewedBy", description: "The name of the authorising staff member" }],
  },
};

export const EVENT_KEYS = Object.keys(EVENT_REGISTRY);

export function isKnownEventKey(key: string): boolean {
  return key in EVENT_REGISTRY;
}

// Fixed sample values for the admin's "preview" and "send test" actions — one flat set covering
// every variable used across all events, since a given event only substitutes the subset it defines.
export const SAMPLE_VARIABLES: Record<string, string> = {
  applicantName: "Jane",
  applicationRef: "PL-DEMO-0001",
  loanPurpose: "home renovation",
  underwriterNote: "Please upload your latest 3 months of payslips.",
  sectionName: "Income & Employment",
  approvedAmount: "45,000",
  reviewedBy: "Alex Cohen",
  declineReason: "Affordability check did not meet the minimum threshold.",
  sendBackReason: "Please confirm your current employer's contact details.",
  guarantorRequiredNote:
    " A guarantor is now required for this application — please complete the new Guarantor Details section, including a supporting document for your guarantor, before resubmitting.",
};
