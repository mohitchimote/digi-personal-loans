# workflow-service

Configurable case workflow for the Java backend: versioned definitions, per-track case state, ownership and SLA, the
immutable transition log. Port 8089, schema `digibank_workflow` (Flyway, `db/migration`), Eureka name `workflow-service`.
The engine (`com.digibank.workflow.engine`) is pure Java, a port of the Worker's `worker/src/lib/workflow/*`, and runs
every vector in `workflow-spec/vectors/` (see `VectorsTest`). The seeded published definition is
`src/main/resources/workflow/loan-origination.v1.json`, a copy of `workflow-spec/loan-origination.v1.json`; a test fails if
they differ.

## Public API (through the gateway, token required)

Same paths and shapes as the Worker.

| Path | Notes |
|---|---|
| `GET /api/workflow/definition` | projection of the published definition for the UI |
| `GET /api/workflow/queues/{key}` | queue settings the actor may open (403 otherwise) |
| `GET /api/workflow/cases/{ref}/actions` | allowed and blocked actions for the actor |
| `GET /api/workflow/cases/{ref}/state` | stage, owner, SLA clock |
| `GET /api/workflow/cases/{ref}/eligible`, `POST .../assign` | need entitlement `case.assign` |
| `POST /api/workflow/cases/{ref}/claim`, `.../release` | ownership rules in `AssignmentService` |
| `GET/PUT /api/workflow/availability` | staff availability for round-robin / least-loaded routing |
| `GET /api/workflow/sla-summary` | SLA roll-up by org unit |
| `/api/auth/admin/workflow/{catalog,definitions,validate,...}` | ADMIN only; draft, save, publish, discard |

`POST /api/workflow/cases/{ref}/actions/{action}` is **not** served here: the gateway sends it to application-service
(route `workflow-action-execute`, before `workflow-runtime`). The admin API is routed here ahead of the auth-service
catch-all (`workflow-admin`).

## Host split: decision

application-service owns application data and every host-level effect (notes, notifications, emails, documents, card
payment, application field updates, compliance audit). workflow-service owns workflow state and decisions. Both entry
paths go through one internal call, `POST /internal/workflow/cases/{ref}/evaluate`:

* (a) the legacy per-action routes (`/api/applications/{ref}/decline` ...) call it with the action key that matches the
  route, then execute what comes back;
* (b) the gateway routes the generic `POST /api/workflow/cases/{ref}/actions/{action}` to application-service, whose
  handler makes the same call with the action from the path.

Why not have workflow-service call application-service back? The effects need application data, mutate it and may
fail halfway; keeping the orchestration in the service that owns that data means a single transaction boundary and one
direction of dependency (application -> workflow), with no callback endpoint to secure, retry or make idempotent. Cost: one
extra gateway route. Both paths then share one code path in application-service, so they cannot diverge.

## Internal contract (`/internal/**`, no token, no gateway route)

Callers: application-service only. Same convention as the other services' internal endpoints: unreachable from outside
because the gateway never forwards `/internal`. Calls are made with a short timeout; on a network failure or 5xx the
caller must fail the user's action (503) and must not apply host effects.

### `PUT /internal/workflow/cases/{ref}` register or update a case summary (idempotent)

Call on application creation and whenever a summary field changes. Body fields, all optional on update:
`applicationType` (`PERSONAL`|`BUSINESS`), `orgUnitId`, `customerId`, `applicantName`, `amount`, `purpose`, `termMonths`,
`referredToRole`, `approvedAmount`, `guarantorRequired`, `guarantorDetailsPresent`, `currentSection`. On first sight it also
creates track state, pinned to the currently published definition version: from `status` / `disbursementStatus` /
`enteredAt` when given (existing application), else from the definition's entry point. On later calls track state is
never touched. Response: `{applicationRef, created, definitionId, tracks:{case:{status,stage},disbursement:{status,stage}}}`.

### `POST /internal/workflow/backfill`

`{cases:[{applicationRef, ...same fields as above, status, disbursementStatus, enteredAt}]}` ->
`{created, updated, failed:[{applicationRef,error}]}`. Each entry is independent and re-runnable. application-service
should call it from a startup routine with every existing application (batches of a few hundred).

### `POST /internal/workflow/cases/{ref}/evaluate`

```
{ "action": "decline",
  "actor": {"type":"STAFF","userId":5,"name":"Una","role":"UNDERWRITER","rank":1,
            "entitlements":["case.decline"],"scope":"ALL","orgUnitId":3},
  "input": {"reason":"..."},                    // action inputs (amount, reason, toRole ...)
  "fields": {"referredToRole":"...","approvedAmount":0,   // optional overrides of workflow-held fields
             "guarantorRequired":false,"guarantorDetailsPresent":false,"currentSection":"x"},
  "commit": true,                                // false = dry run, nothing persisted
  "idempotencyKey": "uuid" }                     // or Idempotency-Key header
```

`actor.type` is `CUSTOMER`, `STAFF` or `SYSTEM`; for a customer `userId` is the customer id. HTTP is always 200 for an
engine decision (a refusal is `ok:false`); 400 for a malformed request, 409 if the idempotency key was used for another case.

Success (`ok:true`): `action`, `event`, `track`, `from {status,stage}`, `to {status,stage}`, `tracks`, `fieldUpdates`
(application fields to write), `referral {close:bool, open:{toRole}|null}`, `hostEffects` (resolved, in order: `NOTE`,
`NOTIFY`, `EMAIL`, `GENERATE_DOC`, `CARD_PAYMENT`, `PIN_FORM_VERSION`, `UNPIN_FORM_VERSION`, `RUN_AUTO_APPROVAL`, each with
its resolved parameters), `log`, plus `mirror` (legacy columns to write: `status`, `disbursementStatus`), `audit
{write,eventType,actor,actorRole,detail}`, `routed {userId,name,stage}|null`, `committed`, `replayed`.
Failure (`ok:false`): `status` (HTTP code to return to the client), `code`, `message`; nothing is persisted.

Idempotency: with a key, the first committed answer is stored and replayed (`replayed:true`) for any retry with the same key;
a retry after a lost response is therefore safe. Without a key a retry evaluates again (the engine's own preconditions then
usually refuse it). application-service should generate one key per user request and reuse it when retrying. The
transition is committed before effects run; if an effect fails, application-service logs it and returns success (as the
Worker does for notifications), because the state change cannot be undone.

Facts the engine needs are computed here, not by the caller: case visibility (org tree), ownership (customer id vs summary),
mandate limit and role ladder (see "Upstream services").

### `POST /internal/workflow/info`

`{refs:["A-1",...]}` -> `{ "A-1": {track,status,stage,stageLabel,enteredAt,assigneeUserId,assigneeName,assignedAt,sla{state,hours,dueAt,...}} }`.
Unknown refs are omitted. For decorating queue and detail screens.

### `POST /internal/workflow/queues/resolve`

`{keys:["pipeline","mine"], actor:{...}}` -> first queue the actor may open `{ok:true,queue,statuses,applyScope,hideReferredAbove}`
or 403. application-service uses `statuses` to filter its application list.

## Upstream services this module calls (cached 10 s, behind interfaces in `client/`)

* `GET {rule}/api/rules/internal/mandates/resolve?role=&orgUnitId=&applicationType=` -> `{limit}` (number or null)
* `GET {auth}/api/auth/internal/roles/ladder` -> `[{code,label,rank}]`
* `GET {auth}/api/auth/internal/org/units` -> `[{id,parentId,levelId,name,code,active}]`
* `GET {auth}/api/auth/internal/staff?role=a,b&orgUnitIds=1,2` -> `[{userId,uuid,fullName,role,orgUnitId,available}]`
  (optional `scope`, `entitlements` are read when present)

A bare JSON body or `{"data": ...}` is accepted. If an upstream is unreachable the call fails with 503 and the user message
"A service this action depends on is unavailable"; the service still boots without them. Compliance audit rows are written to
`digibank_audit.audit_log` best-effort (a failure is logged, never blocks the action).

## Failure behaviour summary

| Situation | Result |
|---|---|
| unknown application on evaluate | 200 `{ok:false,status:404,code:"CASE_NOT_REGISTERED"}`: register first |
| engine refusal (guard, mandate, referral lock, stage) | 200 `{ok:false,status,code,message}`, nothing persisted |
| rule/auth service down | 503, nothing persisted |
| Eureka absent | service still starts (registration retries) |
| audit schema absent | action succeeds, audit failure logged |

## Run and test

```
mvnd test            # engine vectors, H2 (MySQL mode) Flyway + persistence, security with real signed tokens
mvnd spring-boot:run # needs DB_USERNAME, DB_PASSWORD, JWT_SECRET; DB_HOST optional
```
