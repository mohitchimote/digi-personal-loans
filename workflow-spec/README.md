# workflow-spec

The single source of truth for the case workflow engine. **Two engines implement it** (the Cloudflare Worker module and the Java `workflow-service`) and both must pass the same conformance vectors. The workflow itself is configuration: stages, statuses, transitions, guards, effects and queues are data in a *definition*; code only provides the guard/effect primitives a definition can wire together.

| File | What it is |
|---|---|
| `definition.schema.json` | JSON Schema (2020-12) for a definition (`formatVersion` 1) |
| `loan-origination.v1.json` | The default definition: today's behaviour plus the deliberate corrections in `CORRECTIONS.md` |
| `vectors/fixtures.json` | Shared actors, escalation ladder, case fixtures, default facts, fixed clock |
| `vectors/*.json` | Conformance vectors (see "Vectors") |
| `CORRECTIONS.md` | Every place the default definition deliberately differs from the pre-engine behaviour |

## Model

- **Stage**: a phase of the case's life (Application, Underwriting review, Decision and approval, Disbursement, Closed).
- **Track**: an independent state machine. The default definition has `case` and `disbursement`. A case holds one `{status, stage}` per track.
- **Status**: belongs to a stage (or none), has a category (`DRAFT`, `WAITING_CUSTOMER`, `ACTIVE`, `TERMINAL`), a badge class and bilingual labels.
- **Transition**: an *action* on a track: allowed actors, optional entitlement, allowed from-statuses (`["*"]` = any), optional target status (omit = stays put), ordered guards, ordered effects. Transition keys are unique across the whole definition.
- **Queue**: a named list of statuses on a track, with the entitlement(s) needed to open it, and whether org-scope and referral-visibility filtering apply.

Case-creation entry points (`start`, `start_pre_approved`) live on the track; tracks without one start at `initialStatus`.

## Engine contract

Each engine exposes four **pure** functions (no I/O). The host resolves facts first, runs the result's host effects after, and persists state.

```
createCase(definition, entryKey)                            -> CreateResult
evaluate(definition, { case, request, facts })              -> TransitionResult
allowedActions(definition, { case, actor, facts })          -> { allowed: string[], blocked: { [action]: code } }
queueAccess(definition, { actor, queue })                   -> QueueResult
```

**Inputs**

```
case    = { tracks: { <track>: { status, stage } },
            fields: { referredToRole, approvedAmount, guarantorRequired, guarantorDetailsPresent,
                      currentSection, applicationType, orgUnitId } }
request = { action, actor, input: { reason?, approvedAmount?, toRole?, requireGuarantor?, noteType?, section?, text? }, now }
actor   = { type: CUSTOMER | STAFF | SYSTEM, userId, name, role, rank (ladder position or null), entitlements[], scope }
facts   = { caseVisible, isOwner, mandateLimit (number | null), ladder: [{ code, label, rank }] }
```

The host computes `facts`: `caseVisible` from org scope, `isOwner` from the customer id, `mandateLimit` from the mandate resolver for the actor's role and the case's org unit/type (`null` = no mandate row = no authority), `ladder` from the roles with an escalation rank.

### `evaluate` order (fixed, so both engines fail the same way)

1. The action key is found in some track, else `404 UNKNOWN_ACTION`.
2. `actor.type` is in `transition.actors`, else `403 ACTOR_NOT_ALLOWED`.
3. A `STAFF` actor holds `transition.entitlement` (if one is set), else `403 MISSING_ENTITLEMENT`. `SYSTEM` is never subject to entitlements.
4. The track's current status is in `from` (or `from` is `["*"]`), else `409 INVALID_STATE`.
5. Guards, **in array order**; the first failure wins.
6. Effects, in array order. An effect with a `when` condition that is false is skipped.

### Guards

| Type | Fails with |
|---|---|
| `CASE_VISIBLE` | `facts.caseVisible` false → `404 CASE_NOT_FOUND` (existence is not confirmed) |
| `OWNER_OR_ASSISTING` | `CUSTOMER` needs `facts.isOwner`; `STAFF` needs entitlement `case.actAsCustomer`; `SYSTEM` passes → `403 NOT_OWNER` |
| `REFERRAL_LOCK {status}` | the status of the transition's own track equals `status`, `fields.referredToRole` is set, the actor has a rank, and that rank is below the target's rank → `403 REFERRAL_LOCKED` |
| `AMOUNT_POSITIVE {field}` | `input[field]` is not a number greater than 0 → `400 INVALID_AMOUNT` |
| `MANDATE {amountField}` | `SYSTEM` skips. Else `input[amountField]` > `mandateLimit` (`null` counts as 0) → `403 OVER_MANDATE` |
| `REASON_REQUIRED` | `input.reason` missing or blank after trimming → `400 REASON_REQUIRED` |
| `TRACK_STATUS_IS {track, statuses}` | that track's status is not listed → `409 INVALID_STATE` |
| `REFERRAL_TARGET` | resolves `target` = `input.toRole`, else the lowest-ranked ladder role above the actor's rank (an actor with no rank counts as below everything). `toRole` that is not on the ladder or not strictly above the actor → `400 INVALID_TARGET`; no role above → `400 NO_HIGHER_LEVEL`. Makes `{{target.code}}`, `{{target.label}}` available |

### Effects

Engine-level effects change state and appear in the result. Host-level effects are returned verbatim, in order, with templates resolved, for the host to execute.

| Type | Level | Result |
|---|---|---|
| `SET {field, value}` | engine | `fieldUpdates[field] = value` (a later SET to the same field wins) |
| `REFERRAL_CLOSE` | engine | `referral.close = true` |
| `REFERRAL_OPEN {toRole}` | engine | `referral.open = { toRole }` |
| `NOTE {noteType, section, text}` | host | append to `hostEffects` |
| `NOTIFY {template, vars?}` | host | customer notification, localised by the host |
| `EMAIL {event, vars?}` | host | templated email |
| `GENERATE_DOC {doc}` | host | e.g. the approval letter |
| `CARD_PAYMENT {mode}` | host | generate-once card authorisation |
| `PIN_FORM_VERSION` / `UNPIN_FORM_VERSION` | host | freeze / release the form version |
| `RUN_AUTO_APPROVAL` | host | host evaluates auto-approval and, if it passes, calls `auto_approve` as `SYSTEM` |

**Templates.** A string with exactly one `{{path}}` resolves to the typed value (number, boolean, `null`); a missing path resolves to `null`. Otherwise it is interpolated as text (`null` → empty). Paths: `now`, `input.*`, `case.*` (the `fields`), `actor.name|userId|role`, `target.code|label|rank`.

**Conditions** (`when`): `{fact, op: eq|ne|truthy|falsy|in, value?}`, combined with `all`, `any`, `not`. Facts are addressed as `input.*`, `case.*`, `actor.*`, `target.*`.

### Results

```
TransitionResult (success) = {
  ok: true, action, track,
  from: { status, stage }, to: { status, stage },
  tracks: { <every track>: { status, stage } },        // the full updated state
  fieldUpdates: { ... }, referral: { close: bool, open: { toRole } | null },
  hostEffects: [ ... ],
  log: { action, track, fromStatus, toStatus, fromStage, toStage,
         actorType, actorUserId, actorName, actorRole, reason, at }   // reason = input.reason or null
}
TransitionResult (failure) = { ok: false, status: <http>, code, message }
CreateResult = { ok: true, tracks } | { ok: false, status: 404, code: "UNKNOWN_ENTRY" }
QueueResult  = { ok: true, queue, statuses, applyScope, hideReferredAbove } | { ok: false, status, code }
```

`allowedActions`: a transition is *applicable* when the actor type, entitlement and from-status match. An applicable transition is **allowed** if every input-independent guard passes. `AMOUNT_POSITIVE`, `MANDATE`, `REASON_REQUIRED` and `REFERRAL_TARGET` depend on user input and are skipped. A failing `NOT_OWNER` or `CASE_NOT_FOUND` guard hides the action entirely; any other failing guard puts it in `blocked` with the guard's code (this is how the UI shows a greyed button with a reason). `allowed` is sorted by key.

`queueAccess`: `404 UNKNOWN_QUEUE`; `403 MISSING_ENTITLEMENT` unless the actor holds `requiresEntitlement` and `requiresAlso` (if set) and does not hold `excludesEntitlement` (if set).

## Vectors

Each `vectors/*.json` is `{ definition, description, vectors: [...] }`. A vector is one of:

```
{ name, kind: "transition", case, caseOverrides?, action, actor, input?, facts?, expect }
{ name, kind: "create",     entry, expect }
{ name, kind: "actions",    case, caseOverrides?, actor, facts?, expect: { allowed, blocked? } }
{ name, kind: "queue",      actor, queue, expect }
```

`case` and `actor` are names from `fixtures.json`; `caseOverrides` deep-merges into the case fixture; `facts` overrides `defaultFacts`; the request clock is `fixtures.now`.

**Matching.** `expect` is a *partial* match: every key present in `expect` must equal the actual value, recursively; keys absent from `expect` are not checked. Arrays (`hostEffects`, `allowed`) must have equal length and match element by element, in order. Scalars match strictly (so `null` must be `null`).

A runner passes when every vector in every file matches. Both engines ship a runner that loads these files from this directory. **A transition is not finished until both engines agree.**

## Changing a definition

The Worker and Java engines both validate definitions on save and on publish (schema, then cross-references: stages, statuses, tracks, queue statuses, entitlements in the catalog, status reachability, `target.*` only with a `REFERRAL_TARGET` guard, globally unique transition keys). Editing `loan-origination.v1.json` means re-running the vectors; adding a new guard or effect type means a schema change, an implementation in both engines, and vectors.

## Ownership, routing and SLA (host-level contract)

These are not engine rules (the engine's results do not depend on them), but a second implementation must behave the same, so the contract is recorded here. Stage fields in a definition: `owner.roles`, `owner.unitRule` (`ANY`, `CASE_UNIT`, `CASE_UNIT_OR_ANCESTOR`), `routing.mode` (`MANUAL` default, `ROUND_ROBIN`, `LEAST_LOADED`) and `sla.hours` / `sla.amberAtPercent` (default 75).

- **Owner.** One owner per track row. A track that changes **stage** loses its owner; if the new stage routes automatically a new owner is chosen in the same write as the move. A status change inside a stage keeps the owner. Closed (TERMINAL) cases cannot be assigned.
- **Eligible** = enabled staff whose role is in `owner.roles` (with none configured: roles holding `queue.pipeline`), matching `owner.unitRule` against the case's org unit (a case with no unit matches anyone), and able to see the case under their own role's scope.
- **chooseAssignee(candidates, mode)**: `MANUAL` returns nobody; unavailable people are never chosen; `ROUND_ROBIN` picks the earliest `lastAssignedAt` (never-assigned first); `LEAST_LOADED` picks the lowest open-case count, ties broken as round robin; final tie goes to the lowest user id.
- **slaStatus(stage, enteredAt, now)**: no SLA configured or closed gives `NONE`; `percent = elapsed / (hours * 3600000) * 100`; `RED` at 100 and over, `AMBER` from `amberAtPercent`, else `GREEN`. Calendar hours.
- **Operations.** Claim: caller must be eligible; own case is idempotent; someone else's is `409`. Assign: needs `case.assign`; the target must be eligible (`400`). Release: the owner, or anyone with `case.assign`. Each is audited (`CASE_CLAIMED`, `CASE_ASSIGNED`, `CASE_REASSIGNED`, `CASE_RELEASED`, `CASE_AUTO_ASSIGNED`).
- **Unit tests.** `worker/test/assignment.test.ts` pins the two pure functions; the Java service must reproduce those cases.
