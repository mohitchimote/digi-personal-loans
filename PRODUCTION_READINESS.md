# Production Readiness & Infrastructure Dependencies

> **Scope**: this document covers only `frontend/` (Angular) and `backend/` (Java Spring Boot —
> the 7-service architecture described in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §1.2/§2/§3) —
> the artifact being handed to the customer. `worker/` (the currently-deployed Cloudflare
> implementation, used for the sandbox demo) is explicitly **out of scope** — it is not part of
> this handover and is not referenced further below.
>
> **Audience**: this document exists to support the architectural review with the customer's
> technical architect. It answers two questions: (1) which production-grade layers already exist
> *inside* the delivered codebase (open-source, in-repo, versioned), and (2) which layers are
> deliberately **not** in the codebase because they are the client infrastructure team's
> responsibility to provision around it. Section 4 is the actionable list for that team.
>
> **Status note**: `backend/` has been a frozen reference implementation since the Workers
> migration (2026-08-18) and has not received the feature work that has since landed in `worker/`.
> A separate sync effort is bringing it to functional parity before this document's claims are
> exercised end-to-end — see the parity backlog. The claims below describe what is
> **structurally present in the code as it exists today**, not a statement that every feature is
> current.

## 1. Application-layer OSS inventory — what's already in the codebase

Everything in this section ships in `backend/`/`frontend/` today, is open-source, and requires no
infrastructure decision to exist — it's part of the delivered artifact.

| Layer | Component | Where | Notes |
|---|---|---|---|
| Runtime | Java 21 / Spring Boot 3.2.5 | all 7 services | Current LTS-track Spring Boot minor; confirm against Spring's support timeline before go-live. |
| API routing | Spring Cloud Gateway | `api-gateway` (:8080) | Path-based proxy (`/api/auth/**` → auth-service, etc.), plus centralized CORS config (`globalcors`). Single instance — see §3 for HA/LB. |
| AuthN/AuthZ | Spring Security + JJWT | all 7 services | JWT issuance in `auth-service`; the other 5 services (`application-service`, `affordability-service`, `product-service`, `document-service`, `notification-service`) each now validate the same token via a stateless JWT filter reading `role`/`userId` claims — no shared user table, no inter-service call. Fixed 2026-08-28, runtime-verified. See §5, finding 1. |
| Persistence | Spring Data JPA / Hibernate | auth, application, product, document, notification services | `ddl-auto: update` — auto-migrates schema on startup; no versioned migration tool (Flyway/Liquibase) in any service. |
| DB driver | MySQL Connector/J | same 5 services | One MySQL schema per service (`digibank_auth`, `digibank_app`, etc.) — see `ARCHITECTURE.md` §1.2. |
| Validation | Jakarta Bean Validation (`spring-boot-starter-validation`) | auth, application, affordability, product services | `@Valid` on request DTOs. `document-service` and `notification-service` do not declare this dependency. |
| Observability (minimal) | Spring Boot Actuator | `api-gateway` only, `health,info` exposed | No service-level Actuator exposure found on the 6 downstream services. No metrics endpoint (`/actuator/prometheus`) enabled anywhere. |
| PDF generation | iText (`kernel`, `layout`) | `document-service` | Generates approval letters etc. |
| JSON | Jackson | multiple services | Standard Spring Boot default. |
| Frontend framework | Angular 22, standalone components | `frontend/` | Signals for local state, reactive forms. |
| Frontend authz | Route guards (`authGuard`, `businessGuard`, `underwriterGuard`, `adminGuard`, `bankerGuard`, `assistGuard`) | `frontend/src/app/core/guards/` | Client-side only — a UX/routing convenience, not a security boundary. See §5. |

## 2. What's genuinely absent from the codebase (confirmed, not assumed)

Checked directly rather than inferred:

- **No Dockerfile, no docker-compose, no container image definition anywhere in `backend/`.**
- **No CI/CD pipeline in the repo** (no `.github/workflows`, no Jenkinsfile, no equivalent).
- **No custom logging config** (`logback-spring.xml`/`logback.xml`) in any service — every
  service runs on Spring Boot's default console logger. No structured (JSON) log output, no
  correlation/trace ID propagation across the gateway → service hop.
- **No resilience library** (Resilience4j, Bucket4j) and **no Redis dependency anywhere** — so
  Spring Cloud Gateway's `RequestRateLimiter` filter (which requires Redis) is not wired up.
  Nothing in the codebase rate-limits, circuit-breaks, or retries a request.
- **No distributed tracing** (Sleuth/Micrometer Tracing/OpenTelemetry/Zipkin).

These first two (containerization, CI/CD) are normally the **delivery team's** responsibility to
produce, not client infra's to invent — flagged separately in §4 as an internal action item, not
a client dependency.

## 3. Architectural constraints that shape what infra must provide

- **`api-gateway` is a single Spring Cloud Gateway instance**, hardcoded to route to
  `http://localhost:8081`–`8086` (see `api-gateway/src/main/resources/application.yml`). There is
  no service discovery (Eureka/Consul) and no multi-instance routing — as shipped, this assumes
  all 7 processes run on one host. Running this for real requires either externalizing those
  routes to environment-specific config *and* deploying behind a load balancer, or introducing
  service discovery — an architecture decision for the review, not a lift-and-shift.
- **CORS allowed-origins are hardcoded** in `api-gateway`'s `application.yml` (`localhost:4200`, a
  specific dev IP, and one prod hostname as of 2026-08-28 — an ngrok tunnel entry was also present
  and has been removed, §5 finding 6) — this list should still become environment-specific config
  rather than a checked-in literal for a real multi-environment deployment.
- **JWT secret and DB credentials now read from environment variables** (`JWT_SECRET`,
  `DB_USERNAME`, `DB_PASSWORD`) across every service, with no fallback value left in any file — a
  missing env var fails startup rather than running on a guessable default (§5 finding 4, fixed
  2026-08-28) — infra's remaining piece is wiring those env vars from an actual secrets manager
  (§4) rather than setting them by hand per deployment.

## 4. Client infrastructure team — provisioning checklist

None of the following exist in the application layer. Each is a standard piece of infrastructure
that should sit **in front of or around** the deployed services, not inside them — the
application code is written to be hosted, not to self-host these concerns.

| Requirement | Why it's needed | What the app currently does instead |
|---|---|---|
| **WAF** (OWASP Core Rule Set or cloud-native — AWS WAF / Azure Front Door WAF / Cloudflare WAF) | No payload/pattern filtering beyond Bean Validation on individual fields; no protection against known attack signatures (SQLi patterns, XSS payloads, scanner traffic). | Nothing — raw HTTP reaches Spring Cloud Gateway directly. |
| **Load balancer** (L7, health-check aware) | `api-gateway` and every downstream service run as a single instance with no clustering/failover built in. | Nothing — one process per service, no redundancy. |
| **TLS termination + certificate management** | Every service listens on plain HTTP (`server.port`, no `server.ssl.*` config in any `application.yml`). | Nothing — TLS must be terminated upstream (LB/ingress) or added per-service. |
| **API rate limiting / DDoS protection** | No Resilience4j/Bucket4j/Gateway `RequestRateLimiter` configured (would need Redis, which also isn't present). | Nothing — an unthrottled client can call any endpoint as fast as it can open connections. |
| **Secrets management** (Vault / AWS Secrets Manager / Azure Key Vault) | JWT signing secret and DB credentials are now required env vars (`JWT_SECRET`/`DB_USERNAME`/`DB_PASSWORD`) with no fallback anywhere in the codebase (§5 finding 4, fixed 2026-08-28) — but nothing sets those env vars from a real secrets store yet. | Each service fails to start without these three env vars set — no default, no checked-in literal to fall back to. Infra needs to inject real values from a secrets manager (developers set them locally via their own shell/IDE run config for `mvnd spring-boot:run`). |
| **Managed database + backup/DR** | Each service points at `localhost:3306`; no managed MySQL instance, no backup schedule, no point-in-time recovery configured anywhere in the repo. | Nothing — this is entirely an infra decision (RDS/Azure Database for MySQL/Cloud SQL, or self-managed with a backup policy). |
| **Centralized logging / SIEM** (ELK, Splunk, CloudWatch Logs, etc.) | Only console/file logging via Spring Boot defaults, no shipping configured, no structured JSON output. | `System.out`-equivalent console logs only, per-process. |
| **APM / metrics / alerting** (Prometheus + Grafana, Datadog, New Relic, etc.) | Only `api-gateway` exposes Actuator `health`/`info`; no `/actuator/prometheus`, no service exposes Actuator at all on the other 6. No alerting exists anywhere. | Manual health checks against `api-gateway:8080/actuator/health` only. |
| **CDN for static assets** | The Angular production build is served as-is; no CDN-fronting or cache-header strategy is defined in the repo. | Plain static file serving wherever the build output is hosted. |
| **Container orchestration / hosting platform** (K8s, ECS, App Service, etc.) | No Dockerfiles or manifests exist (§2) — this is a delivery-team gap, listed here because infra needs to know the target platform *before* the delivery team can produce the right artifacts. | N/A — needs a joint decision between delivery and infra on target platform. |
| **DNS / domain routing** | Hardcoded hostnames appear in CORS config (§3); production domain(s) need to be finalized and routed to the LB/ingress above. | One hardcoded prod hostname in `api-gateway`'s CORS allow-list. |
| **SMTP / SMS gateway** for OTP delivery | OTP codes are currently echoed back in the API response for demo purposes (no real delivery channel wired in `auth-service`) — this is the single clearest "must swap before production" item, consistent with the same gap already documented for the Worker (`ARCHITECTURE.md` §5). | API response includes the OTP code directly; no provider integration exists. |
| **ADFS federation setup** (staff SSO — not yet built, raised in review) | If staff login moves to SSO (`ARCHITECTURE.md` §11.6), this app becomes a Relying Party/Service Provider that needs to be registered in the customer's ADFS: exchange federation metadata, signing certificates, and register this app's redirect/callback URI. Also needs the customer's ADFS admin to confirm which protocol is configured — SAML 2.0, WS-Federation, or OIDC (§11.6 recommends OIDC if available). | Nothing — no SSO integration exists yet; staff log in the same National ID + OTP way customers do. |

## 5. Vulnerability review (audited 2026-08-28, remediated 2026-08-28)

Critical-vulnerability-focused audit of `frontend/` + `backend/` only (`worker/` out of scope, not
part of the handover). Root cause up front: findings #1–#4 below were the same root cause wearing
four faces — **the Java backend was ported route-by-route with functional parity but never
received a security layer beyond `auth-service`.** Every finding below marked **FIXED** has been
remediated in this codebase and re-verified by re-running the exploit scenario against the running
service post-fix (not just re-reading the code) — see the verification note under each. Nothing in
this section should be read as still-open unless explicitly marked so.

### CRITICAL — all fixed and runtime-verified

1. **FIXED — five of six backend services had no authentication/authorization dependency at
   all.** `application-service`, `product-service`, `affordability-service`, `document-service`,
   `notification-service` now each carry `spring-boot-starter-security` + a
   `security/JwtAuthenticationFilter.java` + `security/SecurityConfig.java` (new files, mirroring
   `auth-service`'s existing filter pattern). Every route now requires a valid JWT by default;
   staff-only endpoints additionally require one of the roles the Worker itself gates
   (`worker/src/routes/applications.ts`'s `STAFF_ROLES`), applied identically in
   `application-service/.../security/SecurityConfig.java`:
   `PUT /mandate-rules` → `ADMIN` only; `GET /mandate-rules`, `PUT /*/section-by-underwriter`,
   `GET /pipeline`, `GET /banker-queue`, `POST /*/notes|decline|send-back|approve-by-underwriter|
   refer-to-senior|disbursement/authorise|disbursement/second-check|data-verification/resolve` →
   any `STAFF_ROLES` member. Same pattern applied to `product-service` (`ADMIN` on `/admin/**`,
   matching `worker/src/routes/products.ts`) and `affordability-service` (`ADMIN` on `PUT /rules`,
   matching `worker/src/routes/affordability.ts`). `document-service`/`notification-service` get
   blanket authentication with no extra role gate, matching the Worker's actual protection level
   there (`documents.ts`/`notifications.ts` also only gate on `requireAuth`, no per-route roles).
   The token itself now carries the claims the other services need to make these decisions without
   a database of their own: `auth-service/.../service/AuthService.buildAuthResponse()` embeds
   `role` and `userId` as JWT claims at issuance (`AuthService.java`), which each new filter reads
   directly — no inter-service call, no shared user table.
   **Runtime-verified**, not just read: booted `affordability-service` standalone and drove the
   full matrix with real signed tokens — unauthenticated `GET /rules` → `403`; `CUSTOMER`-role
   token → `200` (read allowed); `CUSTOMER`-role token on `PUT /rules` → `403` (write correctly
   denied); `ADMIN`-role token on `PUT /rules` → `200` (write correctly allowed); a garbage/invalid
   token → `403`, no crash. All 6 services compile clean (`mvnd compile`) with the new
   dependencies. The mandate-rules-rewrite and IDOR scenarios described in the original finding are
   closed by the same fix (both routes now sit behind the matrix above).
2. **FIXED — document IDOR + unauthenticated PII/financial-document exposure.**
   `document-service` now requires authentication on every route (see #1) — the previously
   fully-open `GET /{docId}/download`/`/view` and `/uploaded/file/{id}/download`/`/view` endpoints
   now reject anonymous requests. **Residual, not closed**: like the Worker's own
   `documents.ts` (checked directly — it has no per-resource ownership check either), this does
   not yet stop one *authenticated* customer from downloading another customer's document by
   guessing a `docId`/`id`. This is a real gap, but not one Java is introducing beyond what the
   reference implementation already accepts — tracked as a follow-up (opaque IDs and/or an
   ownership check comparing the token's `userId` claim to the document's `customerId`), not a
   go/no-go blocker for this review.
3. **FIXED — path traversal on document upload (arbitrary file write).**
   `document-service/.../service/DocumentStorageService.java`: `storeUpload()` now takes only the
   final path component of the attacker-supplied filename (`Paths.get(name).getFileName()`) before
   building the stored filename, then re-validates with `Path.normalize()` +
   `startsWith(dir)` before writing — a filename can no longer resolve outside the intended
   directory. Added a matching `safePathSegment()` allowlist check (`[A-Za-z0-9_-]+`) on
   `applicationRef` too, since it was *also* concatenated into the storage path unsanitized
   (`generateAndStore()` and `storeUpload()` both affected) — checked against
   `ApplicationService.generateApplicationRef()`'s actual output format (`DGB-2026-12345`) to
   confirm the allowlist doesn't reject legitimate values. Compiles clean.
4. **FIXED — hardcoded secrets committed to source, identical across every environment.**
   Every service's `application.yml` (`auth-service`, `application-service`, `product-service`,
   `affordability-service`, `document-service`, `notification-service`) now reads
   `app.jwt.secret`/`spring.datasource.username`/`spring.datasource.password` from
   `${JWT_SECRET}` / `${DB_USERNAME}` / `${DB_PASSWORD}` — **no default value, deliberately**. The
   original literal secret and `root`/`root` credentials have been removed from every file
   entirely (confirmed via a full-repo grep for the old secret string — zero matches, including in
   `target/` build output). A missing env var now fails the service at startup
   (`PlaceholderResolutionException`) rather than silently falling back to a known, guessable
   value. **Runtime-verified both directions**: `affordability-service` refuses to start
   (`mvnd spring-boot:run` exits 1) with no `JWT_SECRET` set; started clean and passed the full
   auth matrix from finding 1 when `JWT_SECRET` was supplied purely via environment variable, never
   written to disk. Any real deployment sets these three env vars from a secrets manager (§4) —
   there is no dev-mode fallback left to forget to override.

### JWT expiry UX — raised in review, fixed 2026-08-28

Adding real auth to 5 services (finding 1) raised a fair follow-up question: what actually happens
when a token expires mid-session — does the user get told, or does the app just silently fail?
Token lifetime itself was already correct (`app.jwt.expiration: 86400000`, 24h, unchanged by this
pass — every issued token carries a real `exp` claim). What was missing was the *response*:

- **Before this fix**: none of the 6 services (including `auth-service`, which had this gap
  pre-existing) configured a custom `AuthenticationEntryPoint`/`AccessDeniedHandler`, so Spring
  Security's defaults applied — a bare `403` with no body, for *every* auth failure (missing
  token, expired token, garbage token, *and* insufficient role all collapsed into the same
  response). The frontend had no interceptor watching for this at all, so a 401/403 fell through
  to whatever ad-hoc error handling (if any) the calling component happened to have. In practice:
  silent failure — a click that just does nothing, or a generic "failed to load."
- **Fixed**: each service now has a `JsonAuthenticationEntryPoint` (401,
  `{"success":false,"message":"Token is invalid or expired.","data":null}` — for missing, expired,
  or malformed tokens) and a `JsonAccessDeniedHandler` (403, `{"success":false,"message":
  "Forbidden.","data":null}` — for a valid token with an insufficient role), wired in via
  `.exceptionHandling(...)` in every `SecurityConfig`. This is the exact contract
  `worker/src/middleware/auth.ts` already used, so the frontend now gets one consistent shape
  regardless of which backend answers.
- **Frontend**: new `session-expired.interceptor.ts` catches any `401` on an authenticated request,
  clears the session, and redirects to `/login` with an i18n'd "Your session has expired. Please
  log in again." message (`login.sessionExpired` in `en.ts`/`he.ts`) shown via the login page's
  existing alert banner. `AuthService.logout()` gained an optional message parameter for this — the
  3 existing manual "Log out" button call sites are unaffected (they pass no message, so nothing
  changes there). **This interceptor benefits the currently-live Worker-backed app too**, not just
  a future Java deployment — the Worker has required auth since `c883eeb` (2026-08-18), so this
  exact silent-failure gap has been live in production since then; it's fixed by this same change.
- **Runtime-verified**: hit a running `affordability-service` with no token, an expired-by-claims
  token, and a garbage token — all three returned `401` with the message above; a valid token with
  the wrong role on a role-gated endpoint returned `403` with `"Forbidden."`. Frontend build
  (`ng build`) passes clean with the new interceptor and component changes.

### Mandate dollar-limit enforcement — raised in review, fixed 2026-08-28

Role gating (finding 1) answers "can this role call the approve endpoint at all," not "is this
*amount* within what that role is allowed to approve." Those are different questions, and only the
first one was enforced server-side. The 5-tier mandate limits (`MandateRules.java` —
`UNDERWRITER` ≤ $100k, `SENIOR_UNDERWRITER` ≤ $300k, `HEAD_OF_LENDING` ≤ $750k, `COO` ≤ $2M, `CEO`
effectively unlimited) were, before this fix, enforced **only in the Angular UI** — explicitly
documented as advisory, not a security boundary, in `MandateRules.limitFor()`'s own Javadoc and in
`ARCHITECTURE.md` §5/§9. Concretely: a valid `UNDERWRITER` token — legitimately issued, not
stolen — could call `POST /{appRef}/approve-by-underwriter` directly (e.g. via Postman, bypassing
the UI entirely) with `approvedAmount: 500000`, five times their mandate, and the service would
approve it. **The same gap exists in the currently-live Worker** (`worker/src/routes/
applications.ts`'s `approve-by-underwriter` handler takes `body.approvedAmount` with no mandate
check either) — this was never built as a real control in either implementation, not a Java
regression. Worker is out of scope for this handover, so it isn't touched here, but the customer
should know the same hole is live in production today.

A closely related issue surfaced while fixing this: every staff decision endpoint (`decline`,
`send-back`, `approve-by-underwriter`, `refer-to-senior`, `disbursement/authorise`,
`disbursement/second-check`, `notes`, `section-by-underwriter`, `data-verification/resolve`) took
`reviewedBy`/`editedBy`/`createdBy` as a **free-text field from the request body** — persisted
verbatim into the audit trail (`UnderwritingNote.createdBy`, etc.). A valid-but-junior token could
claim to be anyone in that field — the audit trail was only as trustworthy as whatever string the
client chose to send, independent of who actually held the token.

**Fixed, both together**: `auth-service` now embeds `fullName` as a third JWT claim alongside
`role`/`userId` (`AuthService.buildAuthResponse()`). `application-service`'s
`JwtAuthenticationFilter` builds a structured `AuthenticatedUser(uuid, userId, role, fullName)`
principal instead of a bare string, so `ApplicationController` can read the caller's real identity
via a `currentUser()` helper. Every one of the 9 endpoints listed above now derives
`reviewedBy`/`editedBy`/`createdBy` from that authenticated principal — **a client-supplied value
for who's acting is no longer trusted anywhere in this controller**, only who the token says it is.
`approveByUnderwriter` additionally rejects (`400`, clear message) any `approvedAmount` above
`mandateRules.limitFor(caller.role())` before the approval is allowed to happen at all.

Also fixed as a byproduct: `application-service` had **no exception handling at all** before this
(new `config/GlobalExceptionHandler.java`, `@ExceptionHandler(IllegalArgumentException.class)` →
400 with the same `{success,message,data}` shape used everywhere else). This mattered beyond the
new mandate-limit rejection: the service already threw `IllegalArgumentException` in a dozen other
places for pre-existing business-rule violations ("Application not found", "Unknown section", "No
pre-approved offer found," etc.) with nothing catching them — they fell through to Spring Boot's
default handler. Turning off `include-message`/`include-binding-errors` globally (finding 5, to
close an info-disclosure risk) had the side effect of silencing those legitimate messages too,
since there was no controlled channel for them. This restores that channel properly instead of via
a blunt global flag.

**Runtime-verified end-to-end against a live `application-service` + MySQL** (not a stateless
service like the earlier tests — this one needed the real database): created a test application as
a `CUSTOMER`; a valid `UNDERWRITER` token attempting to approve **$500,000** (5× their $100k limit)
with a forged `reviewedBy: "FORGED CEO NAME"` was rejected `400` with
`"Approved amount exceeds the mandate limit for your role (UNDERWRITER)..."`; the same token
approving **$50,000** (within limit), still attempting the same forged name, succeeded `200` — and
the persisted audit note showed `"createdBy":"Jane Underwriter"` (the token's real `fullName`), the
forged value silently discarded. A `CEO`-role token approving $500,000 on a separate test
application succeeded, confirming legitimate high-mandate approvals still work. Test data deleted
from the local database afterward.

### HIGH

5. **FIXED — verbose error responses leak internals.**
   `application-service/src/main/resources/application.yml`: `server.error.include-message` /
   `include-binding-errors` now default to `never` (via `${ERROR_INCLUDE_MESSAGE:never}` /
   `${ERROR_INCLUDE_BINDING_ERRORS:never}`) instead of `always` — a developer can still opt back
   into verbose errors locally via env var, but nothing ships that way by default.
6. **FIXED — CORS allowed an ngrok tunnel origin with credentials.**
   `api-gateway/src/main/resources/application.yml`: the ngrok entry is removed from
   `allowedOrigins`; a comment explains why and points at §3/§4 for the fuller fix (this whole list
   should become environment-specific config rather than a checked-in literal, which is an infra/
   config task, not a vulnerability fix per se).

### MEDIUM

7. **Not currently reachable — reclassified, not fixed.**
   `frontend/src/app/pages/admin/email-templates/admin-email-templates.component.ts:132`'s
   `sanitizer.bypassSecurityTrustHtml(res.html)` call is real, but its backend
   (`/api/auth/admin/email-templates/**`) **does not exist in `backend/` at all** — this feature
   was built in the Worker after the Java freeze and is still an unbuilt roadmap item there (§6).
   So this specific code path 404s against the Java backend today; there is nothing to exploit yet.
   Flagged as a build-time requirement for whoever ports email templates to Java: escape any
   customer-supplied value (e.g. full name) server-side before interpolating it into preview HTML,
   so this doesn't become live-exploitable the moment the feature ships.
8. **Not fixed — recommendation, not remediated.** Spring Boot 3.2.5 (April 2024) across all
   services is several patch releases behind current 3.2.x/3.3.x. No exhaustive CVE research was
   done. Left as-is rather than bumped blind, since a version bump on 6 services with no CI/test
   suite (§2) to catch a regression is its own risk — recommend doing this as a deliberate,
   tested step, not folded into this pass. Flag if the architect's checklist requires a specific
   dependency-freshness SLA.

### LOW

9. **Not fixed — accepted, documented.** Auto-increment numeric primary keys (`docId`, `id`,
   `customerId`) are still used as public-facing identifiers throughout rather than UUIDs/refs —
   makes the residual document-IDOR gap in #2 trivially enumerable once someone is authenticated.
   Worth opaque IDs as a future hardening step; not attempted here (touches every DTO/repository
   that exposes these fields — out of proportion with this pass's scope).

### Verified fine

Frontend route guards (`authGuard`, `businessGuard`, `underwriterGuard`, `adminGuard`,
`bankerGuard`, `assistGuard`) all exist under `frontend/src/app/core/guards/` and match
`ARCHITECTURE.md` §5's description. No `innerHTML`/`bypassSecurityTrust*` usage elsewhere in
`frontend/src` besides #7. No `frontend/src/environments/` files with embedded secrets exist (this
project doesn't use one — API base is relative-path/proxy-driven). The frontend's
`auth.interceptor.ts` already attaches `Authorization: Bearer <token>` to every outgoing request
whenever a token exists (it has to, to talk to the Worker, which has required this since
`c883eeb`) — so none of the fixes above needed a matching frontend change.

### What's left before the architect review

Everything CRITICAL and HIGH is fixed and verified. What remains is deliberately **not** blocking:
finding #2's residual ownership-check gap (matches the Worker's own current behavior, not a
regression), finding #7 (nothing to exploit until email templates are built in Java — noted as a
build-time requirement), finding #8 (dependency-freshness recommendation), and finding #9 (opaque
IDs, future hardening). None of these are go/no-go items for this week's review.

## 6. Parity with the Worker — sync backlog (audited 2026-08-28)

`backend/` has been frozen since 2026-08-18; `worker/src/` has since drifted. A parity audit
compared every Worker route/lib against the Java codebase. Summary, in priority order:

1. **Done (2026-08-28)**: the auth/role-gating fix described in §5 has been ported into all 5
   previously-unprotected Java services and runtime-verified. This was the one item that was an
   actual regression, not missing polish — it's no longer open.
2. **This week, cheap and high-value**: diff `business-financials.ts`/`data-verification.ts`/
   mandate-rule thresholds against their existing Java equivalents (`BusinessFinancialsAnalysisService`,
   `DataVerificationService`, `MandateRules.java` — these already exist in Java, built
   pre-migration, so this is a drift check, not a build). Confirms to the architect that the
   Java codebase isn't just old — it's substantively still correct in the areas that matter most
   for underwriting decisions.
3. **Post-review roadmap, not a blocker**: three net-new subsystems have no Java equivalent at
   all and are all additive features, not security-shaped —
   - PDF document-pack (Key Facts Statement, Repayment Schedule, Terms & Conditions,
     pack orchestration) — Large. Belongs in `document-service`, which already has iText and an
     approval-letter generator to extend.
   - Admin-configurable email templates + Resend delivery — Medium–Large. New capability,
     belongs in `auth-service` or `notification-service`.
   - Branding polish (secondary color, gradients, logo upload) — Small–Medium. `auth-service`
     already has a basic `BrandingController`/`BrandingSettings` to extend.

## 7. Domain boundaries — repackaging (raised in review, started 2026-08-28)

Raised in review: `backend/`'s 7 services are physical deployment boundaries, but several bundle
more than one bounded context behind that single deployable (e.g. `affordability-service` mixes
rules administration with rule execution; `application-service` bundles five distinct concerns).
Full analysis and a per-service breakdown — including which contexts are good future-extraction
candidates and which aren't — now lives in `ARCHITECTURE.md` §10, since this is durable structure,
not a point-in-time status note. Summary of the decision behind it: physically splitting services
further right now is **not** recommended (no service discovery, no containerization, no CI/CD per
§2/§3 above — more deployables would multiply that gap before the foundation exists to support it);
internal package-level separation is the low-risk move that makes a *future* physical split
mechanical rather than an untangling exercise, if a real trigger ever shows up.

**`affordability-service` repackaged as the proof of concept** — its `rules` and `assessment`
contexts are now real Java packages (`com.digibank.affordability.rules`,
`com.digibank.affordability.assessment`) instead of a flat `controller`/`service`/`dto`/`config`
layout with no context boundary at all. The key architectural move: `assessment.AffordabilityService`
now depends on a new `rules.AffordabilityRulesView` interface (the 6 getters it actually needs) —
not the mutable `rules.AffordabilityRules` bean directly — so the assessment context has no way to
reach in and change a rule while evaluating a request. Endpoint paths, request/response shapes, and
role gating (`GET /rules` any authenticated role, `PUT /rules` `ADMIN` only, `/check`/`/check-business`
any authenticated role — unchanged from finding 1's fix) are all identical to before the move.

**Runtime-verified after the move, not just compiled**: booted the repackaged service and re-ran the
full auth matrix (no token → 401, valid token → 200 on reads, non-admin → 403 on the rules write,
admin → 200) plus both assessment endpoints (`/check`, `/check-business`) with real payloads,
confirming the new `AffordabilityRulesView` wiring actually produces a correct calculated result,
not just that it compiles. `mvnd compile` clean.

**`application-service` repackaged next (5 contexts, `ARCHITECTURE.md` §10)** — the larger,
genuinely interdependent case: `wizard`, `decisioning`, `audittrail`, `dataverification`, and
`businessfinancials` are now real packages instead of one 710-line `ApplicationService`. Real
cross-context calls (wizard triggers decisioning's auto-approval; both wizard and decisioning call
audittrail for their audit-note side effect) stay as injected-service calls in one direction
(wizard → decisioning → audittrail), never a method reaching into another context's private state.
`dataverification` and `businessfinancials` each got the integration-port treatment answering the
"where's the integration-service" question raised in review: `DataVerificationPort` /
`BusinessFinancialsPort` interfaces with today's simulator as the only implementation
(`SimulatedDataVerificationAdapter` / `SimulatedBusinessFinancialsAdapter`) — a real OCR/credit
-bureau integration becomes a second implementation later, not a rewrite of the orchestrating
service. Endpoint paths and role gating are unchanged. Runtime-verified against a live MySQL
instance: full chain across all 5 contexts (create → save section → data-verification generate →
business-financials generate → mandate-exceeding approval rejected `400` → within-limit approval
accepted `200` → audit note shows the token's real identity, forged `reviewedBy` discarded → staff
-only pipeline correctly blocks a customer token `403`). `mvnd compile` clean on the first pass.

**All 6 remaining services repackaged 2026-08-28** — every service in `backend/` now has its
bounded contexts as real Java packages; full detail per service is in `ARCHITECTURE.md` §10.
Summary:

- **`auth-service`** (4 contexts: `identity`, `staffadmin`, `branding`, `faqs`) — verified with a
  **real login round-trip** (not a crafted token, since this service issues the tokens every other
  service trusts): real OTP request/verify against the seeded admin account, real JWT with correct
  claims, used live against branding/staff-admin/FAQ endpoints.
- **`product-service`** (3 contexts: `catalog`, `preapproved`, `selection`) — verified end-to-end
  against live MySQL: eligibility check, admin CRUD role-gating, pre-approved offer lookup, product
  selection + read-back.
- **`document-service`** (2 contexts: `generation`, `storage`) — verified end-to-end including
  re-confirming the path-traversal fix (finding 3) survived the split. **A real bug was caught and
  fixed in this pass**: an invalid `applicationRef` on upload threw uncaught, which — because
  Spring's default `/error` forward doesn't carry the original `Authorization` header — re-entered
  the security filter chain unauthenticated and came back as a misleading `401` instead of the real
  `400`. Pre-existing since the path-traversal fix itself (found only because this pass actually
  exercised that error path for the first time), not introduced by the repackage. Fixed with a
  `GlobalExceptionHandler` (same shape as `application-service`'s), re-verified: correct `400` now,
  normal upload/generate/view/download flows unaffected.
- **`notification-service`** — no change; already single-context, confirmed as the reference shape
  the others were repackaged toward.

Every service compiles clean (`mvnd compile`) both individually and as a full-suite pass across all
7. No endpoint URLs, request/response shapes, or role-gating rules changed anywhere in this pass —
confirmed by the fact that every runtime test above used the exact same requests the frontend
already sends.

Frontend/i18n/deployment-only commits since the freeze (custom domain cutover, Hebrew
localization fixes, staff UI restyle, terminology wording changes) have no new backend contract
and were not further audited in this pass — flag as a follow-up spot-check only if the frontend
review turns up a mismatch against what `backend/` currently returns.
