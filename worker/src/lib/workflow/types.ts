// Types for the workflow engine. The contract they implement is workflow-spec/README.md; the
// Java workflow-service implements the same contract against the same conformance vectors.

export interface Label { en: string; he: string }

export type StatusCategory = "DRAFT" | "WAITING_CUSTOMER" | "ACTIVE" | "TERMINAL";
export type Badge = "draft" | "in-progress" | "review" | "approved" | "declined";
export type ActorType = "CUSTOMER" | "STAFF" | "SYSTEM";

export interface StageDef {
  key: string;
  label: Label;
  owner?: { roles?: string[]; unitRule?: "ANY" | "CASE_UNIT" | "CASE_UNIT_OR_ANCESTOR" };
  sla?: { hours: number; amberAtPercent?: number };
  /** How a case entering this stage is given an owner. Absent = MANUAL (people claim it). */
  routing?: { mode: "MANUAL" | "ROUND_ROBIN" | "LEAST_LOADED" };
}

export interface StatusDef {
  key: string;
  stage: string | null;
  category: StatusCategory;
  badge: Badge;
  label: Label;
}

export type Condition =
  | { fact: string; op: "eq" | "ne" | "truthy" | "falsy" | "in"; value?: unknown }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export type Guard =
  | { type: "CASE_VISIBLE" }
  | { type: "OWNER_OR_ASSISTING" }
  | { type: "REFERRAL_LOCK"; status: string }
  | { type: "AMOUNT_POSITIVE"; field: string }
  | { type: "MANDATE"; amountField: string }
  | { type: "REASON_REQUIRED" }
  | { type: "TRACK_STATUS_IS"; track: string; statuses: string[] }
  | { type: "REFERRAL_TARGET" };

export type SetField =
  | "submittedAt" | "completionPercentage" | "approvedAmount" | "autoApproved"
  | "referredToRole" | "guarantorRequired" | "currentSection";

type VarMap = Record<string, string | number | boolean | null>;
type When = { when?: Condition };

export type Effect =
  | ({ type: "SET"; field: SetField; value: unknown } & When)
  | ({ type: "REFERRAL_OPEN"; toRole: string } & When)
  | ({ type: "REFERRAL_CLOSE" } & When)
  | ({ type: "NOTE"; noteType: string; section: string; text: string } & When)
  | ({ type: "NOTIFY"; template: string; vars?: VarMap } & When)
  | ({ type: "EMAIL"; event: string; vars?: VarMap } & When)
  | ({ type: "GENERATE_DOC"; doc: "APPROVAL_LETTER" } & When)
  | ({ type: "CARD_PAYMENT"; mode: "AUTHORISE" } & When)
  | ({ type: "PIN_FORM_VERSION" } & When)
  | ({ type: "UNPIN_FORM_VERSION" } & When)
  | ({ type: "RUN_AUTO_APPROVAL" } & When);

export interface TransitionDef {
  key: string;
  label: Label;
  actors: ActorType[];
  entitlement?: string;
  from: string[];
  to?: string;
  guards: Guard[];
  effects: Effect[];
}

export interface TrackDef {
  key: string;
  label: Label;
  entryPoints?: { key: string; status: string }[];
  initialStatus?: string;
  statuses: StatusDef[];
  transitions: TransitionDef[];
}

export interface QueueDef {
  key: string;
  label: Label;
  track: string;
  statuses: string[];
  requiresEntitlement: string;
  requiresAlso?: string;
  excludesEntitlement?: string;
  applyScope: boolean;
  hideReferredAbove: boolean;
}

export interface WorkflowDefinition {
  formatVersion: 1;
  key: string;
  name: Label;
  appliesTo?: { applicationTypes?: ("PERSONAL" | "BUSINESS")[] };
  stages: StageDef[];
  tracks: TrackDef[];
  queues: QueueDef[];
}

// ---------------------------------------------------------------- runtime inputs

export interface TrackState { status: string; stage: string | null }
export type TrackStates = Record<string, TrackState>;

export interface CaseFields {
  referredToRole: string | null;
  approvedAmount: number | null;
  guarantorRequired: boolean;
  guarantorDetailsPresent: boolean;
  currentSection: string;
  applicationType: "PERSONAL" | "BUSINESS";
  orgUnitId: number | null;
}

export interface CaseState { tracks: TrackStates; fields: CaseFields }

export interface Actor {
  type: ActorType;
  userId: number;
  name: string;
  role: string | null;
  rank: number | null;
  entitlements: string[];
  scope: string;
}

export interface LadderRole { code: string; label: string; rank: number }

export interface Facts {
  caseVisible: boolean;
  isOwner: boolean;
  mandateLimit: number | null;
  ladder: LadderRole[];
}

export interface TransitionInput {
  reason?: string;
  approvedAmount?: number;
  toRole?: string;
  requireGuarantor?: boolean;
  noteType?: string;
  section?: string;
  text?: string;
  [k: string]: unknown;
}

export interface TransitionRequest { action: string; actor: Actor; input?: TransitionInput; now: string }

// ---------------------------------------------------------------- results

export type Failure = { ok: false; status: number; code: string; message: string };

export type HostEffect = Record<string, unknown> & { type: string };

export interface LogEntry {
  action: string;
  track: string;
  fromStatus: string;
  toStatus: string;
  fromStage: string | null;
  toStage: string | null;
  actorType: ActorType;
  actorUserId: number;
  actorName: string;
  actorRole: string | null;
  reason: string | null;
  at: string;
}

export interface TransitionSuccess {
  ok: true;
  action: string;
  track: string;
  from: TrackState;
  to: TrackState;
  tracks: TrackStates;
  fieldUpdates: Record<string, unknown>;
  referral: { close: boolean; open: { toRole: string } | null };
  hostEffects: HostEffect[];
  log: LogEntry;
}

export type TransitionResult = TransitionSuccess | Failure;
export type CreateResult = { ok: true; tracks: TrackStates } | Failure;
export type QueueResult =
  | { ok: true; queue: string; statuses: string[]; applyScope: boolean; hideReferredAbove: boolean }
  | Failure;
export interface ActionsResult { allowed: string[]; blocked: Record<string, string> }
