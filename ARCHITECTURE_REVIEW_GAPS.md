# Architecture Review — Gap Tracker

> **Purpose**: on 2026-09-01 the architecture review package (`DigiBank_Solution_Architecture.pptx`
> and `DigiLend_Production_Architecture.docx`) was revised during an internal review session. This
> file tracks the gap between what that package now presents and what actually exists in the
> codebase, so the delivery team can plan and sequence the work — it is **not** a restatement of
> `ARCHITECTURE.md` or `PRODUCTION_READINESS.md`, both of which already track deep, verified detail
> on the Java backend's structure and security posture. Where this file overlaps with either, it
> links rather than repeats, and adds only what the review round surfaced that they don't already
> cover: net-new business scope, inaccuracies introduced into the deck/doc themselves, and a
> build-sequencing view across both.
>
> **How to use this file**: update the Status column as work lands. Don't mark something Done until
> it's been runtime-verified, not just compiled — that discipline is what makes
> `PRODUCTION_READINESS.md` trustworthy, and this file should hold to the same bar.

**Legend** — Priority: `P0` blocks everything else in its group · `P1` should start this quarter ·
`P2` needs a decision or a dependency before it's buildable. Effort: `S` under a week ·
`M` 1–3 weeks · `L` 3–8 weeks · `XL` needs its own project plan. Status: `Not started` ·
`In progress` · `Blocked` · `Done`.

---

## 1. Corrections needed in the reviewed deck/doc themselves

These aren't build items — they're places where the just-reviewed materials say something that
doesn't match the codebase, verified directly rather than assumed. Fix the documents; note the real
gap underneath each.

| # | Claim in deck/doc | What's actually true | Priority | Status |
|---|---|---|---|---|
| C1 | Technical Architecture slide: "End-to-end request correlation (txn ID)" under Observability | **I put this in the deck myself, unverified** — it's stylistically lifted from the reference DigiHome diagram, not something that exists. `PRODUCTION_READINESS.md` §2 confirms directly: no correlation/trace-ID propagation exists across the gateway → service hop in either runtime. Remove the claim or build the capability (§4 below). | P1 | Done — see note below |
| C2 | Doc §10 lists "Full offer-pack document generation" as a **planned extension, not yet built** | It's already built in both runtimes — `worker/src/lib/document-pack.ts` and Java's `document-service.generation.GenerationService.generateOfferPack()` both produce approval letter + Key Facts Statement + Repayment Schedule + Terms & Conditions (`PRODUCTION_READINESS.md` §6 item 3). The real gap is that every document but the approval letter carries placeholder legal content pending real Israeli legal/compliance review — §10 should say that, not "not yet built." | P2 | Done — see note below |
| C3 | Functional slide, Underwriter Workbench: "Case assignments (auto and manual allocations)"; doc §2.5 states the same as a *current* capability | Grepped the entire codebase — zero case-assignment/allocation logic exists anywhere. `ARCHITECTURE.md` §11.5 explicitly records this as an **open, unresolved architectural question** (which service should even own it), not a built feature — and the same document's own §10 (Planned Extensions) correctly lists it as not built. §2.5 contradicts §10 of its own document. Fix §2.5 to describe the pipeline as it exists today (one shared queue, no allocation) and move the assignment description fully into §10. | P0 | Done — see note below |
| C4 | Naming: doc uses `auth-service`/`DigiLend_auth`; deck uses `user-auth-service`/`DigiLend_user-auth`; **actual code** uses `auth-service`/`digibank_auth` | Three different names for the same thing, not two — the doc's own Open Point 2 only catches the deck-vs-doc mismatch, not that neither matches code. See §5 (naming decision) below — this needs one decision applied to code, doc, and deck together. | P0 | Done — see Q1 note below |
| C5 | Doc §7.1: rule-service is described as the eventual owner of affordability thresholds, "an open point for this review" | Correctly hedged in the doc already (§11 open point 3) — no correction needed, listed here only so it's cross-referenced from one place. See §2 below. | — | N/A |

**C1/C2/C3 note (2026-09-02)**: fixed directly in both files using `python-docx`/`python-pptx` (no
copies, edited in place, run-level text replacement to preserve existing formatting/bold labels).

- **C1** — `DigiBank_Solution_Architecture.pptx`, Technical Architecture slide, OBSERVABILITY & OPS
  box: replaced the false "End-to-end request correlation (txn ID)" bullet with "No cross-service
  request correlation (txn ID) yet — planned", matching the honest phrasing style already used by
  the sibling bullet underneath it.
- **C2** — `DigiLend_Production_Architecture.docx`: §7.3 (Document storage) no longer calls the
  offer pack "a near-term extension" — it now says all four documents are generated today and only
  the approval letter carries final legal content, the rest placeholder pending legal/compliance
  review. §10 (Planned Extensions)'s "Full offer-pack document generation" bullet was rewritten to
  "Offer-pack legal content" — the real remaining item — instead of claiming generation itself isn't
  built.
- **C3** — fixed in both files. Deck's Functional slide, Underwriter Workbench box: "Case
  assignments (auto and manual allocations)" → "Shared case queue, visible to all underwriters —
  allocation planned, not yet built". Doc §2.5: the same "Case assignment" bullet now reads "Case
  queue: every submitted case is visible to every underwriter in one shared queue... automatic or
  manual allocation... is not yet built (Section 10)" — no longer contradicts §10's own Planned
  Extensions entry for case allocation, which was already correct and untouched.

**Q1 note (2026-09-02) — naming decision made and applied**: standardized on `auth-service` /
`digibank_*`, i.e. **the names the codebase already uses everywhere** (every service's
`application.yml` datasource URL, every Maven module name — confirmed by grepping all 7
`application.yml` files, not assumed) — rather than renaming running code, a live MySQL schema
naming convention, and Docker/CI config to match either document. Renaming code was the
higher-risk, higher-effort direction for a gap tracked as `S` effort; correcting two documents was
not.

Applied to both review documents (`python-docx`/`python-pptx`, in place):
- **Deck**: Technical Architecture slide's `user-auth-service` label → `auth-service`; the five
  schema-cylinder labels `DigiLend_user-auth`/`DigiLend_app`/`DigiLend_product`/
  `DigiLend_notification`/`DigiLend_docs` → `digibank_auth`/`digibank_app`/`digibank_product`/
  `digibank_notifications`/`digibank_docs`; the matching wrapped label on the front-end component
  slide (`user-auth-` / `service` → `auth-` / `service`).
- **Doc**: §5 (Service Catalogue) schema table's five `DigiLend_*` rows → `digibank_*`; §11 Open
  Point 2 (naming consistency) rewritten from an open question into a resolution record, so a future
  reader isn't told to re-decide something already decided.
- Verified no `DigiLend_*` schema name or `user-auth-service`/`user_auth` string remains in either
  file afterward (searched both, paragraphs/tables/all slide shapes) — the only `DigiLend_*` hits
  left are the product name "TCS DigiLend Personal Loans" and literal filename references to the
  doc itself, both correctly untouched.

---

## 2. `rule-service` / `integration-service` don't exist as deployable services — sequencing matters here

The deck and doc now describe a **nine-component** backend (seven the browser can reach plus
`rule-service`/`integration-service` behind them, each with its own port). The actual `backend/`
directory has exactly the same **seven Maven modules** it has had throughout — confirmed directly,
not inferred. Nothing named `rule-service` or `integration-service` exists.

This is **not** an oversight to rush — `ARCHITECTURE.md` §10 and `PRODUCTION_READINESS.md` §7
already made a deliberate, reasoned call on this: the *logical* seams already exist as clean,
extractable interfaces (`rules.AffordabilityRulesView`, `dataverification.DataVerificationPort`,
`businessfinancials.BusinessFinancialsPort` in Java; the equivalent `lib/` modules in the Worker),
and physically splitting them into separate deployables **before** containerization, CI/CD, and
service discovery exist would multiply an operational gap that doesn't have a foundation yet. The
architecture review package has now committed to the end state in writing, though, so the
foundation work has a firm deadline it didn't have before.

| # | Gap | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|
| G1 | **Containerize all services** — no Dockerfile exists anywhere in `backend/` (`PRODUCTION_READINESS.md` §2). This is delivery team's responsibility, not client infra's — flagged explicitly as such in that doc. | P0 | M | — | In progress — see note below |
| G2 | **Stand up a CI/CD pipeline** — no `.github/workflows`, no Jenkinsfile, nothing (`PRODUCTION_READINESS.md` §2). Needed before any extraction, since more deployables with no pipeline is strictly worse. | P0 | M | G1 | In progress — see note below |
| G3 | **Introduce service discovery** — `api-gateway` hard-codes `localhost:8081`–`8086` (`PRODUCTION_READINESS.md` §3). Either externalize routes to environment-specific config plus a load balancer, or bring in Eureka/Consul — an architecture decision, not a lift-and-shift. | P0 | M | — | Done — runtime-verified, see note below |
| G4 | **Extract `rule-service`** — new Spring Boot module; move `MandateRules`, `AffordabilityRules` (currently in-memory in `application-service`/`affordability-service`) behind it; every current caller becomes a real internal REST call instead of a local method call. Resolves doc Open Point 3 along the way (does it need a persistent schema?). | P1 | L | G1–G3 | Done — runtime-verified, see note below |
| G5 | **Extract `integration-service`** — new Spring Boot module; move the OTP/OCR/credit-bureau/Open-Banking adapter seams (today: `DataVerificationPort`/`BusinessFinancialsPort` in `application-service`, OTP delivery in `auth-service`) behind it. | P1 | L | G1–G3 | Done — runtime-verified, see note below |
| G6 | **Persist `MandateRules`/`AffordabilityRules` in Java** regardless of G4's timing — both are still plain in-memory `@Component` singletons that reset on every restart. The Worker side already fixed the equivalent gap during its own migration (`ARCHITECTURE.md` §9 — now persisted D1 tables); Java hasn't caught up. This can and should happen before or independently of the full `rule-service` extraction. | P0 | S | — | Done — resolved as a side effect of G4, see note below |

**G4/G6 note (2026-09-01) — Done, and actually runtime-verified end-to-end, not just compiled**:
new `rule-service` module (port 8087, matches the doc's service catalog), no gateway route — every
consideration in §2 above about sequencing (containerization/CI/CD/service discovery first) is now
satisfied by G1–G3, which is exactly the trigger `PRODUCTION_READINESS.md` §7 said to wait for
before physically splitting further. Two contexts, `mandates` and `affordability`, each with a real
JPA entity (`digibank_rules` schema — `mandate_limits` one row per role; `affordability_rule_settings`
a single settings row) seeded with the exact defaults the old in-memory beans shipped with. This
resolves G6 as a side effect, as planned — both rule sets now survive a restart, which they never
did before.

Every existing caller was rewired to a real internal REST call instead of a local bean, with the
public contract preserved as a thin proxy so nothing calling through the gateway changed:
- `application-service.decisioning.DecisioningController`/`DecisioningService` — `MandateRules` is
  now a plain DTO (no more `@Component`), fetched/written via new `client.RuleServiceClient`
  (10s-TTL cache, so an admin edit lands without a restart but a compromised/hung rule-service can't
  add unbounded latency to every approval). `/api/applications/mandate-rules` GET/PUT unchanged;
  ADMIN-only write gating unchanged (enforced in `SecurityConfig`, untouched by this refactor).
- `affordability-service.rules.RulesController` — same pattern, new
  `client.RuleServiceClient`/`rules.CachedAffordabilityRulesView` (the latter is now the sole bean
  satisfying `AffordabilityRulesView`, so `assessment.AffordabilityService` needed no code change at
  all — exactly the payoff the interface split was designed for in `PRODUCTION_READINESS.md` §7).
  `/api/affordability/rules` GET/PUT unchanged.
- `product-service`'s per-product eligibility filter (`CatalogService.isEligible`) was investigated
  and deliberately left alone — the doc's "Product Eligibility Criteria" pillar is product-level
  data (min credit score/income/DTI stored on each `LoanProduct` row), not a shared threshold that
  belongs in a central rules store, so there's nothing to extract there.

**Runtime-verified, not just compiled**: booted `rule-service`, `affordability-service`, and
`application-service` as plain jars against the real local MySQL (no Docker — same constraint as
G1/G3) and drove the full chain with real tokens: `GET`/`PUT /internal/rules/mandates` and
`/internal/rules/affordability` directly against `rule-service` (seeded defaults correct, edits
persisted independently of the caller); `GET`/`PUT /api/applications/mandate-rules` through
application-service's proxy (ADMIN token → 200 and change visible directly on `rule-service` without
going through it again; UNDERWRITER token on the PUT → 403, rule-service left untouched); `GET
/api/affordability/rules` through affordability-service's proxy (200, correct live values); `POST
/api/affordability/check` end-to-end (used `rule-service`'s live `maxDti`/`baseAnnualRate` to
correctly compute `dti`/`calculatedMonthlyRepayment`, not a stale/default value). `mvnd compile`
clean on `rule-service`, `application-service`, `affordability-service`.

**G5 note (2026-09-01) — Done, and actually runtime-verified end-to-end, not just compiled**:
scope was narrowed from the original four-port plan during investigation, once two things became
clear. First, `PRODUCTION_READINESS.md` §7 had already recorded a deliberate 2026-08-28 decision to
hold off on a physical `integration-service` until containerization/CI/CD/service discovery
existed — G1–G3 cleared that this session, so this isn't reversing that decision, it's fulfilling
the condition it was waiting on. Second, re-checked every doc pillar against the actual code:
`WizardService`'s `creditScore: 780` turned out to be hardcoded seed data for the pre-approved-offer
demo shortcut, not a bureau call — the doc's own table (`ARCHITECTURE.md` §9) already lists the
customer-declared credit score, Open Banking connection, and National ID registry tick as
frontend-only simulations with no backend counterpart at all, now confirmed directly rather than
just believed. So there is no fourth port and no `CreditScorePort` — three seams covered it:

New `integration-service` module (port 8088, no gateway route, no datasource — it holds no state of
its own, unlike `rule-service`):
- **`dataverification`/`businessfinancials`** — `SimulatedDataVerificationAdapter`'s and
  `SimulatedBusinessFinancialsAdapter`'s generation logic moved here **unchanged**, exposed via
  `POST /internal/integration/data-verification/generate` and `.../business-financials/generate`.
  In `application-service`, the two `Simulated*Adapter` classes were deleted and replaced with
  `IntegrationServiceDataVerificationAdapter`/`IntegrationServiceBusinessFinancialsAdapter` — thin
  REST clients implementing the same unchanged `DataVerificationPort`/`BusinessFinancialsPort`
  interfaces. `DataVerificationService`/`BusinessFinancialsAnalysisService` (the orchestrators that
  persist results) needed **zero code changes** — exactly the payoff `PRODUCTION_READINESS.md` §7
  designed these ports for.
- **`otp`** — genuinely new (no prior seam existed to move). New `OtpDeliveryPort` in `auth-service`
  + `IntegrationServiceOtpDeliveryAdapter`, wired into `OtpService.generateAndAssign` after the code
  is persisted. Fire-and-forget by design: wrapped in try/catch so a hung/unreachable
  integration-service can never block registration or login — `demoOtp` is still returned to the
  caller for on-screen display exactly as before, completely independent of whether the simulated
  "delivery" call succeeds.

**Runtime-verified, not just compiled**: booted `integration-service`, `auth-service`, and
`application-service` as plain jars (no Docker — same constraint as G1/G3/G4) and drove real
traffic: all three `internal/integration/*` endpoints directly (data-verification and
business-financials produced correct seeded discrepancies/financials from realistic payloads; OTP
deliver returned a synthetic provider ack); a full registration through `auth-service` still
returned the unchanged `demoOtp` contract; **killed `integration-service` and registered again** —
registration succeeded in 150ms with no visible degradation, proving the delivery call is truly
non-blocking; restarted `integration-service` and drove a real application end-to-end through
`application-service` (`start` → save `personalDetails`/`incomeEmployment`/`creditDeclarations` →
`GET /data-verification` returned live, correctly-seeded discrepancies; `start-business` → save
`businessFinancials`/`businessCreditDeclarations` → `GET /business-financials-analysis` returned a
live P&L/cashflow/ratios analysis) — both through the unchanged public endpoints, proving the
adapter swap is invisible to every existing caller. `mvnd compile` clean on `integration-service`,
`application-service`, `auth-service`.

With G4 and G5 both done, `backend/` now has all nine components the architecture review package
describes — `rule-service` and `integration-service` match the doc's service catalog on port,
gateway-route status, and scope.

**G3 note (2026-09-01) — Done, and actually runtime-verified end-to-end, not just compiled**:
chose Netflix Eureka (Spring Cloud) over Consul — `api-gateway` already pulls the compatible
Spring Cloud 2023.0.1 BOM, and it keeps every component in the same Java/Spring stack rather than
introducing a non-JVM dependency. New `service-registry` module (single instance — nine components
in one region doesn't need a peer-replicated cluster). All 7 existing services now register with
it (`@EnableDiscoveryClient` + `spring.application.name` as the service id).

**Scope was deliberately narrowed from "every static URL" to "just the gateway's routes"**, which
is the literal problem this gap names. `api-gateway`'s routes are now `lb://<service>`, resolved
dynamically via Eureka + Spring Cloud LoadBalancer. The internal RestTemplate calls
(`application-service` → notification/document/affordability/product-service,
`notification-service` → `auth-service`) deliberately stay on G1's static, env-var-parameterized
URLs — converting those too would mean local dev (`mvnd spring-boot:run` on an individual service)
*requires* the registry running for any inter-service call to work at all, which is a bigger
behavior change than "add service discovery" should quietly carry, and wasn't what was asked.
Every service still works completely fine on its own without the registry running — only
`api-gateway`'s routing genuinely depends on it now, which is the intended, named fix.

**Actually proven working, not assumed**: booted the registry, `auth-service`, and `api-gateway` as
plain jars (no Docker — same constraint as G1) and routed a real request through the gateway —
`POST http://localhost:8080/api/auth/login/request-otp` resolved `lb://auth-service` via Eureka to
the live instance's real IP and returned a correct response. Along the way, hit and fixed a real
issue rather than assuming the happy path: Eureka's self-preservation mode (correct default for
large fleets, a liability for a 9-service dev/Compose deployment) kept a hard-killed test
instance's stale registration alive past its lease, causing the load balancer to route to a dead
address — disabled it on `service-registry` (`enable-self-preservation: false`), confirmed clean
single-instance registration and a correct routed response afterward. `start-backend.ps1` updated
to start `service-registry` first; `docker-compose.yml` updated with the new service and
`EUREKA_SERVER_URL` wired into all 7 clients (still not Docker-engine-verified, same caveat as G1).

**G1 progress note (2026-09-01)**: a Dockerfile + `.dockerignore` now exists for all 7 services
(multi-stage `maven:3.9-eclipse-temurin-21` build → `eclipse-temurin:21-jre-alpine` runtime,
non-root user, `HEALTHCHECK` against `/actuator/health`), plus a `backend/docker-compose.yml` and
`.env.example` wiring them together with MySQL for local integration testing. This also required
two small enabling changes, done and compiled clean:
- Added `spring-boot-starter-actuator` + a permitted `/actuator/health` route to the 6 services that
  didn't have it (only `api-gateway` did before) — runtime-verified on `affordability-service`:
  health returns `200` with no token while every other endpoint still correctly requires one.
- Parameterized every hard-coded `localhost` reference — `spring.datasource.url` (`${DB_HOST:localhost}`)
  and every inter-service `app.*.url`/gateway route `uri` (`${..._URL:http://localhost:PORT}`) — so
  Docker Compose can point services at each other by container name without touching code again.
  Defaults preserve today's `mvnd spring-boot:run` behavior exactly. This is a lighter-weight,
  compose-friendly step, not the full service-discovery answer G3 still needs for a real multi-host
  deployment.

**Not yet build/run-verified against a real Docker engine** — this development machine has neither
Docker nor WSL installed. What *has* been checked without one: `docker-compose.yml` parses as valid
YAML, every Dockerfile's copied jar filename matches the actual Maven build output exactly, every
environment variable name the compose file sets matches a real placeholder in the corresponding
service's config (both cross-checked programmatically, not by inspection), and all 7 services still
compile clean after every config change. The first `docker compose up --build` on a machine with
Docker is the real verification step and should happen before this item moves to Done.

**G2 progress note (2026-09-01)**: three GitHub Actions workflows now exist —
`.github/workflows/backend-ci.yml` (matrix over all 7 services: `mvn verify`, then on a push to
`master` only, build the G1 Dockerfile and push it to `ghcr.io/<repo>/<service>:latest`+`:<sha>`),
`frontend-ci.yml` (`npm ci` → `npm run build` → unit tests), and `worker-ci.yml` (`npm run
typecheck`, matching the exact verification method used by hand throughout this project's session
history). Scope is deliberately **CI, not CD** — there's no decided deployment target yet (doc Open
Point 11), so this stops at "a tested image lands in the registry," not at deploying it anywhere.

One real, unrelated bug surfaced and fixed while wiring this up: `frontend/src/app/app.spec.ts` had
a leftover Angular CLI scaffold assertion checking for placeholder `"Hello, frontend"` title text
that was never customized — the real root component has no `<h1>`/title at all
(`template: '<app-connection-watchdog-banner /><router-outlet />'`). Confirmed by actually running
`npm test` before writing the workflow: it failed on exactly this, unrelated to anything about CI
itself. Removed the stale assertion, re-ran, confirmed green (`1 passed`), so the new pipeline
starts green rather than red on day one for a pre-existing issue.

**What's verified vs. not**: every command in these workflows was run directly on this machine
first — `npm run build`, `npm test -- --watch=false` (confirmed it terminates rather than hanging
in watch mode — the project uses Angular's newer Vitest-backed `@angular/build:unit-test` builder,
not Karma, so no browser/display setup is needed), and `npm run typecheck` all pass. The one
exception: this machine has `mvnd` (the Maven daemon) but not plain `mvn`, so `mvn -B verify` as
written in the workflow could not be executed locally — GitHub's hosted `ubuntu-latest` runners do
ship Maven by default, and `mvnd`/`mvn` share the same underlying build (verified all session via
`mvnd`), but the exact CI invocation is unverified. As with G1, the real test is the first actual
run on GitHub Actions — push this and watch the Actions tab before marking either gap Done. I have
not pushed anything; these files exist locally only, since triggering a real run means pushing to
`origin`, which needs your go-ahead first.

---

## 3. Net-new business scope surfaced by this review round

None of the following existed in any form before this review round — no code, no prior roadmap
entry in `ARCHITECTURE.md`. Each needs a specification before it's buildable, not just engineering
time.

| # | Item | What's needed before build can start | Priority | Effort | Status |
|---|---|---|---|---|---|
| N1 | **Card payments** | A payment provider decision (which processor, PCI scope implications), then an adapter behind `integration-service` (G5) — same pattern as every other external provider. Doc correctly marks this "planned, not built." | P2 | M | Not started |
| N2 | **Core banking integration landscape** (Product Sync, Customer Information File, CASA Accounts, Disbursements, Collateral Module — doc §3.4) | Specification, data mapping, protocol, and error/reconciliation approach with the client's core banking team — doc's own Open Point 8 states none of this exists yet. This is the single largest unscoped item in the whole package; until it has an owner and a first workshop date, it can't be estimated. | P2 | XL | Not started |
| N3 | **Reporting schema / data warehouse replication** (doc §3.4, table 2) | A target warehouse identified, a replication method and cadence agreed, and — critically — a rule for masking personal data in the reporting copy (doc Open Point 12). No code, no design. | P2 | L | Not started |

---

## 4. Security & reliability residuals (real, confirmed, not yet fixed)

Pulled forward from `PRODUCTION_READINESS.md` §5 and §2 specifically because the reviewed materials
now imply a more finished security/observability posture than exists — listed here so they're
visible next to the review, not just buried in that document's residual-findings section.

| # | Gap | Priority | Effort | Status |
|---|---|---|---|---|
| S1 | **Document IDOR** — an authenticated customer can download another customer's document by guessing a sequential `docId`/`id`. True in both the Worker and Java (`PRODUCTION_READINESS.md` §5 finding 2) — not a Java regression, but real in the system being reviewed. Fix: opaque IDs and/or an ownership check comparing the token's `userId` to the document's `customerId`. | P0 | S | Done — runtime-verified, see note below |
| S2 | **No session/token revocation** — JWTs are stateless, 24h, no refresh or blacklist. If a staff member's role changes or they leave, their token is valid until natural expiry. (Doc Open Point 9.) | P1 | M | Not started |
| S3 | **No malware/content scanning on uploads** — path-traversal is fixed (`PRODUCTION_READINESS.md` §5 finding 3); nothing inspects file content or type before storage. (Doc Open Point 7.) | P1 | M | Not started |
| S4 | **No distributed tracing, no correlation ID, no structured logging** — see C1 above. Needed for both the deck's own claim to become true and for any real multi-service debugging once `rule-service`/`integration-service` exist. | P1 | M | Partially done — correlation ID shipped and runtime-verified, see note below; full distributed tracing and structured (JSON) logging remain out of scope |
| S5 | **No gateway-level rate limiting** — Spring Cloud Gateway's `RequestRateLimiter` needs Redis, which isn't present; nothing throttles a client anywhere in the app layer (`PRODUCTION_READINESS.md` §2/§4 — correctly scoped as partly a client-infra WAF/edge concern, but the Redis-backed in-app option is also just absent). | P2 | M | Not started |
| S6 | **Numeric sequential IDs used as public identifiers** — makes S1 trivially enumerable once authenticated. Opaque-ID hardening touches every DTO/repository that exposes these fields (`PRODUCTION_READINESS.md` §5 finding 9, LOW, explicitly deferred). | P2 | M | Not started |
| S7 | **Spring Boot 3.2.5 is several patch releases behind current** — no CVE research done; recommend a deliberate, tested bump rather than folding into another change, given there's no CI/test suite yet to catch a regression (`PRODUCTION_READINESS.md` §5 finding 8). | P2 | L (re-scoped from S) | Done — runtime-verified, see note below |

**S7 note (2026-09-02) — Done, and actually runtime-verified end-to-end, not just compiled. Scope
turned out much larger than originally estimated**: checked current release status before touching
anything, since "several patch releases behind" undersold it — as of today the entire Spring Boot
3.x line is EOL (3.2 died 2025-12-31, and even 3.5, the last 3.x line, went EOL 2026-06-30). The
only currently-patched lines are 4.0 (EOL 2026-12-31) and 4.1 (recommended, supported through
2027-07-31), so this was a **major-version migration** (Spring Framework 7) across all 10 backend
modules, not a patch bump — re-scoped from `S` to `L` effort and confirmed with the user before
starting, since a same-session major-version jump wasn't what the original estimate implied.

Bumped every module (all 7 original services, plus `rule-service`/`integration-service`/
`service-registry` added since) to `spring-boot-starter-parent` 4.1.1 and `spring-cloud.version`
2025.1.2 (the Spring Cloud train Spring's own release notes list as compatible with Boot 4.0.7 and
4.1.0). Java version requirement was already satisfied — Boot 4.0's minimum is Java 21, which every
service was already on. Breaking changes found and fixed, one pilot service (`auth-service`) first
to discover the pattern, then mechanically applied to the rest:

- **`RestTemplateBuilder` moved packages** (`org.springframework.boot.web.client` →
  `org.springframework.boot.restclient`) and its builder methods were renamed
  (`setConnectTimeout`/`setReadTimeout` → `connectTimeout`/`readTimeout`) — hit in the 4 services
  with a `RestTemplateConfig` (`auth-service`, `application-service`, `affordability-service`,
  `notification-service`); each also needed a new explicit `spring-boot-starter-restclient`
  dependency, since `RestTemplateBuilder` is no longer bundled with `spring-boot-starter-web`.
- **`org.hibernate.dialect.MySQL8Dialect` was removed** in Hibernate 7 (bundled with Boot 4.1) —
  every service with an explicit `hibernate.dialect` property (6 of them) now points at
  `org.hibernate.dialect.MySQLDialect`, the modern auto-versioning dialect Hibernate itself
  recommends (confirmed via its own deprecation warning at boot: "MySQLDialect does not need to be
  specified explicitly... it will be selected by default" — left it explicit anyway, matching every
  other service's existing style rather than removing the property).
- **Spring Cloud Gateway's artifact and property namespace both changed** in the 2025.0 train —
  `spring-cloud-starter-gateway` → `spring-cloud-starter-gateway-server-webflux` in `api-gateway`'s
  pom, and every `spring.cloud.gateway.*` property (`routes`, `globalcors`, `default-filters`) moved
  under `spring.cloud.gateway.server.webflux.*` in its `application.yml` — this stays the same
  reactive/WebFlux gateway it always was, just renamed to disambiguate from the new WebMvc variant
  Spring Cloud Gateway now also offers.

**Runtime-verified, not just compiled**: booted all 10 modules together as plain jars against real
local MySQL (no Docker — same constraint noted throughout this file for G1/G3/G4/G5) and drove real
traffic through the live stack:
- `service-registry` → `auth-service` → `api-gateway`: a real login OTP request routed through the
  gateway resolved `lb://auth-service` via Eureka on Spring Cloud 2025.1.2 and returned correctly —
  confirms G3's service-discovery capability survived the migration, not just that it compiles.
- **Re-ran S1's exact IDOR verification post-migration**, this time through the gateway rather than
  direct-to-service: registered two fresh customers, uploaded a document as one, confirmed the other
  customer's token still gets `403 Forbidden` and the owner's own token still gets `200` — the
  security fix from earlier this session survived the framework migration intact.
- Full cross-service chain exercised end-to-end: `POST /api/affordability/check` (affordability-
  service calling rule-service for live thresholds) computed a correct DTI/repayment figure;
  `POST /api/applications/start` created a real application row; `POST /api/products/eligible`
  returned the real eligible-product list with live rates.
- `mvnd compile` clean on all 10 modules in one final sweep after every fix landed.

**Two false alarms during verification, chased down and ruled out rather than assumed** (consistent
with this file's own standard of not marking something Done from a hunch): an "IDOR still broken"
scare on `affordability-service` turned out to be a wrong field name in my own test JSON payload; a
"JWT rejected" scare on `product-service` turned out to be a bare `GET /api/products` request
against a URL that was never mapped (the real endpoint is `POST /api/products/eligible`) — Spring's
fallback `/error` dispatch isn't in that service's `permitAll()` list, so the resulting 404 surfaced
as a misleading 401 instead. Diagnosed with Spring Security's own TRACE logging rather than guessing
further; both diagnostics were removed before finishing, confirmed via `git diff` showing no residue.
Neither was a real regression — both services work correctly against their actual endpoints,
confirmed above.

Not touched, out of scope for this item: G1's Dockerfiles and G2's CI workflow both already pin Java
21 (Boot 4.0's minimum), so neither needed a change for this migration to take effect.

**S4 note (2026-09-02) — correlation ID shipped and runtime-verified; distributed tracing and
structured logging are separate, larger items left undone**. Scoped deliberately: a request
correlation ID needed no new infrastructure and is what C1's now-corrected deck claim was
specifically about ("end-to-end request correlation (txn ID)"); full distributed tracing
(span-level timing across services, a trace backend to query) and structured/JSON logging (a log
shipper, a schema, typically paired with a centralized logging/SIEM stack) are both still tracked as
not-built — S4's own text already scoped those together with the deck's claim, and the deck itself
lists "Centralized logging/SIEM + APM/alerting" as a separate, still-honest "planned infra
dependency, not yet wired" bullet this session didn't touch.

Same pattern across all 9 backend services (not `service-registry` — it's Eureka infrastructure, not
in the customer-facing request path), new `observability` package per service:

- **`CorrelationIdFilter`** (`OncePerRequestFilter`) — reuses an incoming `X-Correlation-Id` header
  when the request already has one (arrived via `api-gateway` or another internal service), else
  generates a fresh UUID. Puts it in SLF4J MDC under `correlationId` and echoes it back as a response
  header (so a customer/support conversation can reference the same ID a log search would use).
  Registered via a `FilterRegistrationBean` at `Ordered.HIGHEST_PRECEDENCE` — explicitly ahead of
  Spring Security's own filter chain, so even a 401/403 response still carries a correlation ID
  instead of only successful requests getting one.
- **`CorrelationIdRequestInterceptor`** (`ClientHttpRequestInterceptor`) — added only to the 4
  services with a `RestTemplateConfig` and thus outbound calls (`auth-service`,
  `application-service`, `affordability-service`, `notification-service`); reads the current MDC
  value and adds it to every outbound internal request, so the ID survives a
  gateway → service → service hop instead of resetting at each boundary. `rule-service`,
  `integration-service`, `document-service`, and `product-service` make no outbound HTTP calls
  (confirmed by grepping for `RestTemplate` in each — none found), so they only needed the filter.
- **`api-gateway`** runs on WebFlux, not Spring MVC, so it got a `CorrelationIdGlobalFilter`
  (`GlobalFilter`/`Ordered`) instead of the servlet filter — the true entry point for a
  browser-originated request. Mutates the proxied request to carry the header downstream; only backfills
  it onto the *response* if the routed-to service didn't already echo one back itself (route-not-found,
  a filter rejecting the request before proxying) — first version double-added the header (gateway
  pre-set it, then proxied the downstream service's own echoed response header through unchanged),
  caught during verification below and fixed to check-before-add.
- **`logging.pattern.level: "%5p [%X{correlationId:-}]"`** added to each of the 9 services'
  `application.yml` (the officially-documented lightweight way to inject an MDC value without a full
  custom `logback.xml`, e.g. Spring's own pre-Sleuth trace/span-ID convention) — renders as
  `INFO [a1b2c3d4-...]` in place of the bare level; the `:-` default keeps background/startup logs
  (no request in flight) clean rather than printing an empty `[]`.

**Runtime-verified, not just compiled**: booted all 10 modules together as plain jars against real
local MySQL (no Docker, same constraint as every other item in this file) and drove real traffic
with a caller-supplied `X-Correlation-Id`:
- **Gateway round trip**: `POST /api/auth/login/request-otp` through `api-gateway` with
  `X-Correlation-Id: e2e-verify-99999` → response carried exactly one `X-Correlation-Id` header
  (confirms the double-add fix) with the same value.
- **MDC-to-log injection, proven with two independent real application log lines** (not inferred from
  the filter running, an actual printed log line): `auth-service`'s
  `IntegrationServiceOtpDeliveryAdapter` WARN (the integration-service-unreachable warning already
  used to verify G5) printed `WARN [test-corr-12345]`; a deliberately-triggered validation error on
  `affordability-service` printed `WARN [validation-error-test-33333]` from Spring's own
  `DefaultHandlerExceptionResolver`. Both confirm the pattern renders the live MDC value, not just
  that the property parses.
- **Cross-service call chain**: `POST /api/affordability/check` (affordability-service calling
  rule-service via `RuleServiceClient`, the interceptor-attached `RestTemplate`) returned correct
  live rule-service-sourced figures — functional proof the interceptor doesn't break the call it
  instruments, alongside the header-based propagation proof above.
- **Response-header echo confirmed directly on every one of the 9 services** (not just the ones with
  a convenient log line to check): `auth-service`, `affordability-service` (direct and via gateway),
  `product-service`, `document-service`, `notification-service`, `rule-service`,
  `integration-service`, and `api-gateway` itself all correctly echo a caller-supplied
  `X-Correlation-Id` back unchanged.
- `mvnd compile` clean on all 9 modified services.

Not done, deliberately out of scope for this pass: MDC propagation across `api-gateway`'s own
reactive/Reactor threads (WebFlux doesn't carry ThreadLocal-based MDC across operator boundaries the
way a servlet thread does — would need the `context-propagation` library or manual Reactor `Context`
bridging to make the gateway's *own* logs show the ID; the gateway's job here is forwarding the
header to the services that *can* log it, which is verified above and is the part that actually
matters for tracing a request across services).

**S1 note (2026-09-02) — Done, and actually runtime-verified end-to-end, not just compiled**: added
an ownership check (staff roles bypass, a customer must own the document) to every document
read/download/view endpoint in both runtimes — the four `docId`/`id`-keyed reads the doc/generated
tables expose, in both the Worker and Java.

- **Worker** (`worker/src/routes/documents.ts`): new `assertOwnsDocument(c, documentCustomerId)`
  helper — 403s unless `authUser.role` is staff or `authUser.id === documentCustomerId` — called from
  both `serveGenerated` (`/:docId/download`, `/:docId/view`) and `serveUploaded`
  (`/uploaded/file/:id/download`, `/uploaded/file/:id/view`). Same locally-duplicated `STAFF_ROLES`
  list pattern already used in `applications.ts`/`admin.ts` (tracked as Q2 — not fixed here, kept
  consistent instead of inventing a third shape).
- **Java** (`document-service`): the service's `JwtAuthenticationFilter` only extracted `role` from
  the JWT before this — it now also extracts `userId` (already embedded in every token by
  `auth-service`'s `AuthService`, used the same way in `application-service`) into a new
  `AuthenticatedUser` record (mirrors `application-service`'s), retrieved via a new `CurrentUser`
  helper. `StorageController`/`GenerationController` each gained the same
  `assertOwnsDocument(Long)` pattern as the Worker, throwing Spring Security's `AccessDeniedException`
  (caught by the existing `JsonAccessDeniedHandler` via `ExceptionTranslationFilter` — no new wiring
  needed) — applied to all four download/view endpoints across both controllers.
  `SecurityConfig`'s comment, which had explicitly documented this as an accepted gap mirroring the
  Worker's, was corrected to describe where the check now actually lives.

**Runtime-verified, not just compiled, on both runtimes**:
- **Worker**: booted via `wrangler dev` against the real local D1/R2. Logged in as two real
  customers (`login/request-otp` → `login/verify-otp`, demo OTP) plus the seeded ADMIN. Customer A
  downloading customer B's pre-existing generated document (`/api/documents/2/download`) → `403
  Forbidden`; B downloading their own → `200`; the same pair repeated against a pre-existing uploaded
  document (`/api/documents/uploaded/file/2/download`) → `403` then not attempted as owner (B wasn't
  the owner of record for that row, so only the negative case applies there); ADMIN downloading both
  → `200`/`200`, confirming the staff bypass wasn't broken by the fix.
- **Java**: booted `auth-service` and `document-service` as plain jars against real local MySQL (no
  Docker — same constraint noted throughout this file). Registered two fresh customers through the
  real OTP registration flow, uploaded a document as one and generated a full offer pack as the same
  one. The other customer's token got `403 Forbidden` on both the uploaded-document download and the
  generated-document download; the owner's own token got `200` on both; the seeded `ADMIN` account
  (`000000015`, from `auth-service`'s `DataSeeder`) got `200` on the non-owned uploaded document,
  confirming staff access still works. `mvnd compile` clean on `document-service`.
- Frontend (`document.service.ts`) needed no change — every download/view call already goes through
  `HttpClient` with the auth interceptor attaching the bearer token, so the new check is transparent
  to every existing caller.

---

## 5. Quick wins (small, already fully scoped, no dependency)

| # | Gap | Priority | Effort | Status |
|---|---|---|---|---|
| Q1 | **Naming decision** (C4) — pick one of `auth-service`/`user-auth-service` and one schema prefix, apply to code (package/schema/pom rename), doc, and deck together. Small in isolation; touches every service's config and both review documents. | P0 | S | Done — decided in favor of code, both documents updated, see §1 Q1 note |
| Q2 | **`STAFF_ROLES` is a hardcoded array literal duplicated across 7 places** (`ARCHITECTURE.md` §11.3) — adding or changing a staff role means editing all 7 in sync today. Not urgent to solve with the full Role & Entitlements roadmap context (§11.1) — a single shared constant or config value would remove the duplication risk now. | P1 | S | Not started |
| Q3 | **Branding polish** (secondary colour, gradients, logo upload) — flagged as small–medium, post-review roadmap in `PRODUCTION_READINESS.md` §6 item 5. | P2 | S | Not started |

---

## 6. Decisions needed before buildable (not engineering work — need an owner)

These come from the doc's own §11 (Open Points for Architecture Review) and `ARCHITECTURE.md` §11.5
— listed here only so the build-sequencing view in §7 below can reference them, not to duplicate
their detail:

- Sandbox → production migration estimate (doc Open Point 1) — nothing sizes the Worker+D1+R2 → nine-component Java + managed MySQL + object storage move yet, including the data-layer migration itself.
- Non-functional requirements — volumes, concurrency, response-time targets, availability commitment (doc Open Point 4). My earlier infra sizing estimate assumed the target topology already existed and was explicit that it's a planning estimate pending these numbers.
- Recovery objectives — RTO/RPO, automatic vs. invoked failover, object storage replication, rehearsal cadence (doc Open Point 5).
- Data protection & retention — encryption at rest, key rotation, cross-schema erasure execution, DPIA (doc Open Point 6).
- Regulatory positioning — applicable regime, affordability-evidence retention, decline explainability (doc Open Point 10).
- Environments, delivery pipeline, test strategy (doc Open Point 11) — overlaps directly with G1/G2 above; once those exist this point is largely answered.
- Accessibility standard and RTL testing scope (doc Open Point 13).
- **Where case allocation actually belongs** (`ARCHITECTURE.md` §11.5) — `application-service` vs. the workforce/org-structure side. Needs a delivery owner's call before N-anything about case assignment can be built, independent of C3's documentation fix.
- SSO/ADFS protocol (SAML 2.0 vs. WS-Federation vs. OIDC) and provisioning model (JIT vs. pre-provisioned) — fully designed already in `ARCHITECTURE.md` §11.6, just needs the client's ADFS admin to confirm before build starts.

---

## 7. Suggested build sequence

1. **Now, in parallel, no dependencies** — done: Q1 (naming), S1 (document IDOR), C3/C1/C2 (fix the three deck/doc inaccuracies so the review package is accurate while the rest of this executes).
2. **Foundation** — done: G1 → G2 → G3 (containers, CI/CD, service discovery).
3. **Extraction** — done: G4 (`rule-service`, resolved G6 as a side effect) and G5 (`integration-service`), both runtime-verified. `backend/` now matches the doc's nine-component service catalog.
4. **In parallel with 1, needs an owner not a sprint**: the decisions in §6 — particularly the sandbox-to-production estimate and the case-allocation ownership question, since both block downstream work if left open too long.
5. **After a spec exists, not before**: N1–N3 (card payments, core banking, reporting warehouse) — none of these are engineering-ready yet regardless of how much delivery capacity is available.
6. **Done**: S7 (Spring Boot 3→4 migration, re-scoped from a patch bump to a major-version jump once the real EOL status was checked — see its note above).
7. **Done**: S4's correlation-ID slice (request tracing across the gateway → service hop) — full distributed tracing and structured/JSON logging remain not-built, tracked as the same item's unfinished remainder.
8. **Next up, not yet started**: S2, S3, S5, S6 (session revocation, upload malware scanning, gateway rate limiting, opaque IDs), and Q2/Q3 (STAFF_ROLES deduplication, branding polish) — none block each other or anything above.
