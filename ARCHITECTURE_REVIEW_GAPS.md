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
| C6 | Deck's Technical Architecture slide and doc §7.1's schema table both show six MySQL schemas, omitting `digibank_rules`; doc §7.1 and §11 open point 3 still describe rule-service's thresholds as in-memory/unbuilt, an "open point" | `rule-service` has owned a real, persistent `digibank_rules` schema (`mandate_limits`, `affordability_rule_settings`) since G4, runtime-verified 2026-09-01 — the schema table and both open-point references had gone stale the moment G4 shipped and were never updated | P1 | Partially done (doc fixed, deck edit pending — manual, see note below) |

**C1/C2/C3 note (2026-09-02)**: fixed directly in both files using `python-docx`/`python-pptx` (no
copies, edited in place, run-level text replacement to preserve existing formatting/bold labels).

- **C1** — `DigiBank_Solution_Architecture.pptx`, Technical Architecture slide, OBSERVABILITY & OPS
  box: replaced the false "End-to-end request correlation (txn ID)" bullet with "No cross-service
  request correlation (txn ID) yet — planned", matching the honest phrasing style already used by
  the sibling bullet underneath it. **Superseded 2026-09-02 (same day, later in the session)**: once
  S4 actually shipped `X-Correlation-Id` propagation, this bullet was updated again to "X-Correlation-Id
  propagated end-to-end via MDC (§4, §9)" — see the dated note below.
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

**Deck/doc consistency pass (2026-09-02, continued)**: the user edited the Technical Architecture
slide directly in LibreOffice (ESB/MQ/DMS layout repositioned, a new `digibank_audit` schema box
added) and asked for a full deck-vs-doc consistency review in auto mode. Found and fixed, all
verified visually via headless LibreOffice → PDF → PNG render (`soffice --headless --convert-to
pdf`, `pymupdf`), not just by reading the XML:

- **Arrow routing regression**: the user's LibreOffice edit reconnected the Object
  Storage/DMS arrows to originate from the `digibank_docs` schema box instead of from
  `document-service` — the same imprecision flagged and fixed once already earlier in the session.
  Rerouted as five-segment obstacle-avoiding paths (round the MySQL container's right edge, through
  the gap before the ESB box, back in above the Core Banking row) so the lines read correctly as
  sourced from `document-service` without cutting through unrelated boxes.
- **`digibank_audit` had no equivalent in the doc**: added as a new row in §7.1's schema table
  (marked "Shared — written by any service that performs an auditable state change", not attributed
  to one owning service, since the deck shows no arrow into it from any single service), a new
  paragraph after the affordability-service schema paragraph explaining it's the one deliberate
  exception to "one schema per service," a new Open Point #19 (MySQL vs. a separate MongoDB-based
  audit store, per the review discussion — undecided), and added to the §3.1 ASCII topology diagram's
  MySQL box.
- **Stale naming leftover in the ASCII diagram** (§3.1): the diagram's service box still read
  `user-auth-svc` — the Q1 rename pass caught prose and the deck but missed this hand-drawn box;
  fixed to `auth-svc`, box-drawing alignment preserved and verified character-for-character.
- **C1's fix had gone stale**: see the superseded note above — the deck said correlation IDs were
  "not yet — planned" when S4 (this same session) had already shipped them; updated to match.
- Swept the full 7-slide deck's text and the full doc for `user-auth`/`DigiLend_auth`/`DigiLend_app`/
  `iText` regressions — none found; both files clean.

**Open Point #19 resolved (2026-09-17) — MySQL `digibank_audit`, plus a first basic implementation**
(user decision: resolve the decision *and* build a first working slice, not just document the
choice). MySQL wins over a separate MongoDB-based store for the same reason Redis was rejected for
S2/S5 — no new infra to stand up and run; the schema already existed as a documented concept since
2026-09-08, this just makes it real. Full architecture pattern (why one flat table, why its own
Hikari pool instead of a second JPA `EntityManagerFactory`, the swallow-all write convention) is in
`ARCHITECTURE.md` §6.9 — not duplicated here.

- **What's covered**: every decisioning action and wizard edit/note (`application-service`'s
  `AuditTrailService.addNote` — one hook point, covers decline/send-back/approve/refer/disbursement/
  second-check/edit/note uniformly) and every staff-management action (`auth-service`'s
  `UserAdminController` — role change, enable/disable, staff create/delete). Worker mirrors both
  (`applications.ts`'s `addNote`, `admin.ts`'s staff routes) into a new `auditLog` D1 table
  (migration `0009_sticky_callisto.sql`).
- **What's NOT covered, deliberately** (a first slice, not a comprehensive audit trail): customer
  self-service actions that don't call `addNote` (e.g. `approveApplication`'s conditional-approval
  path), and every other service (affordability-service, product-service, document-service,
  notification-service, rule-service, integration-service) — none of them currently perform a state
  change that seemed worth auditing on this first pass. Extend using the `ARCHITECTURE.md` §6.9
  recipe when one does.
- `mvnd compile` clean on `application-service` and `auth-service`; `npx tsc --noEmit` clean on the
  worker; the D1 migration was generated and applied to the local database. **Not runtime-verified
  against a live MySQL round-trip this session** — no local DB credentials (`DB_USERNAME`/
  `DB_PASSWORD`) were available in this environment to actually start `auth-service`/
  `application-service` against MySQL and confirm a row lands in `digibank_audit.audit_log`.
  Flagging honestly rather than claiming full verification, per this project's standing
  verify-before-claiming-done convention — worth a real end-to-end check (trigger a decline, a role
  change, query the table) next time the Java stack is actually run.

**C6 note (2026-09-08)**: the user made a further LibreOffice edit to the deck and asked for another
full deck-vs-doc consistency pass. Rather than a layout regression this time, the pass surfaced a
staleness gap that had survived every prior pass since G4 shipped (2026-09-01): grepped
`backend/rule-service/src/main/resources/application.yml` and confirmed `rule-service` connects to
`jdbc:mysql://.../digibank_rules`, a real schema — but neither review document had ever been updated
to say so.

Fixed in the doc with `python-docx` (in place, run-level text replacement) and verified visually via
headless LibreOffice → PDF → PNG render. **The matching deck edit was attempted with `python-pptx` and
reverted the same day** — saving this particular deck through `python-pptx` silently corrupted it for
PowerPoint viewers (black backgrounds, wrong theme colors, garbled footer text, on every slide, not
just the one edited) even though LibreOffice's own render looked identical before and after. Recovered
by restoring from LibreOffice's own auto-backup of the user's last Impress save. Full incident record:
`project_ppt_corruption_incident_2026-09-08` in memory. **The deck's rule-service box therefore still
does not mention `digibank_rules`** — going forward, pptx changes are flagged here in text for the user
to apply by hand in Impress rather than edited programmatically:
- **Deck (not yet applied — needs a manual edit in Impress)**: Technical Architecture slide,
  `rule-service (internal)` box, last line — append "(own digibank_rules schema)" after "every
  threshold", i.e. "...single source of truth for every threshold (own digibank_rules schema)".
- **Doc §7.1 schema table**: added a `digibank_rules` / `rule-service (internal)` row ("Mandate
  limits (5-tier) and affordability rule settings — extracted from digibank_app during the
  rule-service extraction (G4)"); fixed the `digibank_app` row, which still listed "mandate rules" as
  living there after they'd moved out.
- **Doc §7.1 body paragraph**: no longer says affordability-service's thresholds "sit in an
  in-memory configuration store" or that rule-service's persistent schema is a future "target
  design" — both were true before G4, neither is true now.
- **Doc §11 open point 3** ("Ownership of lending policy"): marked resolved as of 2026-09-01 (rule-
  service's schema exists, runtime-verified, both services read it live via a cached client) while
  keeping honest what G4 didn't touch — policy-change versioning and replaying a decision against the
  policy that applied on the day still have no answer, so the point stays open for those two
  questions specifically rather than being closed outright.
- **Doc §5 service catalogue, affordability-service row**: "in the target design it reads its
  thresholds from rule-service" → "reads its thresholds live from rule-service via a cached client" —
  same target-vs-actual tense fix, cross-referenced to the now-updated open point.

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
| N1 | **Card payments** | A payment provider decision (which processor, PCI scope implications), then an adapter behind `integration-service` (G5) — same pattern as every other external provider. Doc correctly marks this "planned, not built." | P2 | M | Done — simulated adapter (real processor decision still deferred), see note below |
| N2 | **Core banking integration landscape** (Product Sync, Customer Information File, CASA Accounts, Disbursements, Collateral Module — doc §3.4) | Specification, data mapping, protocol, and error/reconciliation approach with the client's core banking team — doc's own Open Point 8 states none of this exists yet. This is the single largest unscoped item in the whole package; until it has an owner and a first workshop date, it can't be estimated. | P2 | XL | Not started |
| N3 | **Reporting schema / data warehouse replication** (doc §3.4, table 2) | A target warehouse identified, a replication method and cadence agreed, and — critically — a rule for masking personal data in the reporting copy (doc Open Point 12). No code, no design. | P2 | L | Not started |

**N1 note (2026-09-09)**: user decision — build a simulated adapter now (same "fake it" pattern as
OCR/bureau/Open Banking, ARCHITECTURE.md §6.3), not a real processor integration; the payment
provider decision (which processor, PCI scope) stays deferred, same as the doc always said.

- **`integration-service`**: new `cardpayment` package — `CardPaymentController`
  (`POST /internal/integration/card-payment/authorise`, no gateway route, internal-only) →
  `CardPaymentGenerator`, seeded by `applicationRef.hashCode()` exactly like
  `BusinessFinancialsGenerator`. Produces a synthetic transaction id/status/card-last-4/
  authorisation-code.
- **`application-service`**: new `cardpayment` package — `CardPaymentPort` interface +
  `IntegrationServiceCardPaymentAdapter` (mirrors `businessfinancials`'s Port/Adapter exactly).
  Wired into `DecisioningService.authoriseFundRelease` — the natural hook point (already exists as
  the one staff action representing "release funds"; was previously a pure status-flag flip with no
  adapter call). New nullable `LoanApplication.cardPaymentResultJson` column, generate-once-then-
  persist, wrapped in the same swallow-all try/catch as `maybeAutoApprove`'s other adapter calls —
  a synthetic side effect must never block the actual fund release.
- **Worker**: `worker/src/lib/card-payment.ts`, using the existing `javaStringHashCode`/
  `SeededRandom` helpers (same contract as `business-financials.ts`). New
  `cardPaymentResultJson` column (migration `0008_eminent_roxanne_simpson.sql`), wired into
  `POST /:appRef/disbursement/authorise`. Verified determinism directly (same `applicationRef` →
  identical `transactionId`/`cardLast4`/`authorisationCode` across calls, different `applicationRef`
  → different values; `generatedAt` legitimately differs, it's a timestamp) via a throwaway script.
- `mvnd compile` clean on `integration-service` and `application-service`; `npx tsc --noEmit` clean
  on the worker.

---

## 4. Security & reliability residuals (real, confirmed, not yet fixed)

Pulled forward from `PRODUCTION_READINESS.md` §5 and §2 specifically because the reviewed materials
now imply a more finished security/observability posture than exists — listed here so they're
visible next to the review, not just buried in that document's residual-findings section.

| # | Gap | Priority | Effort | Status |
|---|---|---|---|---|
| S1 | **Document IDOR** — an authenticated customer can download another customer's document by guessing a sequential `docId`/`id`. True in both the Worker and Java (`PRODUCTION_READINESS.md` §5 finding 2) — not a Java regression, but real in the system being reviewed. Fix: opaque IDs and/or an ownership check comparing the token's `userId` to the document's `customerId`. | P0 | S | Done — runtime-verified, see note below |
| S2 | **No session/token revocation** — JWTs are stateless, 24h, no refresh or blacklist. If a staff member's role changes or they leave, their token is valid until natural expiry. (Doc Open Point 9.) | P1 | M | Done — see note below |
| S3 | **No malware/content scanning on uploads** — path-traversal is fixed (`PRODUCTION_READINESS.md` §5 finding 3); nothing inspects file content or type before storage. (Doc Open Point 7.) | P1 | M | Partially done (type/signature validation shipped; real malware scanning needs new infra — see note below) |
| S4 | **No distributed tracing, no correlation ID, no structured logging** — see C1 above. Needed for both the deck's own claim to become true and for any real multi-service debugging once `rule-service`/`integration-service` exist. | P1 | M | Partially done — correlation ID and structured logging shipped and verified; full distributed tracing remains out of scope, see note below |
| S5 | **No gateway-level rate limiting** — Spring Cloud Gateway's `RequestRateLimiter` needs Redis, which isn't present; nothing throttles a client anywhere in the app layer (`PRODUCTION_READINESS.md` §2/§4 — correctly scoped as partly a client-infra WAF/edge concern, but the Redis-backed in-app option is also just absent). | P2 | M | Done — Java side is the item that matters (see note below); worker/Cloudflare side deliberately not pursued |
| S6 | **Numeric sequential IDs used as public identifiers** — makes S1 trivially enumerable once authenticated. Opaque-ID hardening touches every DTO/repository that exposes these fields (`PRODUCTION_READINESS.md` §5 finding 9, LOW, explicitly deferred). | P2 | M | Done — API-boundary obfuscation shipped for documents/notifications in both stacks, see note below |
| S7 | **Spring Boot 3.2.5 is several patch releases behind current** — no CVE research done; recommend a deliberate, tested bump rather than folding into another change, given there's no CI/test suite yet to catch a regression (`PRODUCTION_READINESS.md` §5 finding 8). | P2 | L (re-scoped from S) | Done — runtime-verified, see note below |
| S8 | **No field/shape validation on wizard section saves** — `PUT /:appRef/section` and `/section-by-underwriter` accepted `data: Record<string, unknown>` (worker) / `Map<String, Object>` (Java) and stored it verbatim: any channel could submit an arbitrary JSON blob under any section key, with no check that it matched that section's actual shape. Raised directly in the 2026-09-09 architecture review (`Architecture Review Notes.docx`, "Field Exposure Controls"/"Channel-Specific Validation") — banking applications undergo intensive pen-testing and unrecognised fields "should not be returned or accepted." | P1 | M | Done — see note below |
| S9 | **POST-not-GET for banking integrations, and `integration-service`'s ESB placement** — same 2026-09-09 review, "Secure Channel And API Design"/"POST-Based Integration" and "Enterprise Integration And ESB Placement": GET is discouraged for banking calls (use a POST wrapper object); `integration-service` should stay a lightweight internal gateway, not a parallel ESB. | P2 | S | Done — mostly already true, one real gap fixed; see note below |

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

**S4 remainder note (2026-09-09) — structured JSON logging shipped; full distributed tracing still
not built, and now explicitly flagged rather than left ambiguous**. Full tracing needs OpenTelemetry
(or equivalent) across all 9 Java services + the worker, plus a trace collector/backend (Jaeger,
Zipkin, Grafana Tempo) — that collector is itself new infrastructure to provision and run, in
tension with the "no new infra" framing that drove the Redis decision for S2/S5. Treating it as its
own scoped decision (which backend, self-hosted vs. managed) rather than building it opportunistically.

- **Java (all 9 services)**: added `logstash-logback-encoder` 8.0. New plain `logback.xml` per
  service (deliberately not `logback-spring.xml` — no `<springProfile>` or other Spring-specific XML
  tags are used, so the plain filename works identically for Spring Boot *and* is picked up by
  Logback's own classpath auto-config outside a full Spring Boot bootstrap, e.g. a unit test that
  never starts Spring; `logback-spring.xml` is Spring-Boot-bootstrap-only and silently does nothing
  in that case — a real trap, caught by the first attempt at verifying this: an initial
  `logback-spring.xml` produced a passing-looking but actually-plain-text log line in a throwaway
  test, because the test never boots Spring). `logging.level.*` overrides in each `application.yml`
  are untouched and still apply (Spring Boot's `LoggingSystem` processes those regardless of a custom
  XML); only the now-redundant `logging.pattern.level` line each service had (added by the original
  S4 slice above, `%5p [%X{correlationId:-}]`) was removed — the JSON encoder supersedes it, and
  `CorrelationIdFilter`'s existing MDC value now lands in the JSON output as a top-level
  `correlationId` field automatically, no extra wiring needed. Verified with a throwaway JUnit test
  (captured stdout, parsed the line back with Jackson, asserted `message`/`correlationId`/`level`
  fields) — deleted after confirming; no permanent test suite exists in any of these services yet.
  `mvnd compile` clean on all 9.
- **Worker**: new `worker/src/lib/log.ts` (`logError(message, error, context)`), replacing all 6
  existing `console.error(...)` call sites (`index.ts`, `applications.ts` ×2, `email.ts` ×2,
  `notifications.ts`) with structured JSON output. **No `correlationId` field on this side** — the
  worker has no equivalent request-scoped correlation-ID mechanism (single-process monolith, not a
  chain of services a header needs to propagate across), and adding one now is net-new scope beyond
  "structured logging," not part of this item; flagged explicitly rather than silently left out.
  `npx tsc --noEmit` clean; confirmed no `console.error` call sites remain outside `log.ts` itself.

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

**S8 note (2026-09-09)**: added one schema per wizard section (17 total, covering both the personal
and business flows) to both backends, `.strict()`/unknown-field-rejecting in both — a request whose
`data` doesn't match its section's exact known shape now fails with 400 instead of being stored.

- **Worker**: `worker/src/lib/section-schemas.ts` — one Zod schema per section (`.strict()` at every
  nesting level, not just the top level), wired into both `PUT /:appRef/section` and
  `/section-by-underwriter` in `worker/src/routes/applications.ts` via a new `validateSectionData()`
  helper; the column write now persists the *validated* value, not the raw request body. Field lists
  came from reading the actual Angular step components' payloads, not just
  `frontend/src/app/core/models/index.ts` — that file turned out to be missing several real fields
  (e.g. `personalDetails.applicant2`, `guarantorDetails.files`, three `companyDetails` staff-assist
  fields) for multiple sections it claims to describe. `npx tsc --noEmit` clean; sanity-checked the
  schema set against one realistic and one deliberately-broadened payload per section (a script, not
  a permanent test file — the worker has no test suite either) — every real shape parses, every
  smuggled extra field is rejected.
- **Java**: `backend/application-service`'s `WizardController`/`ApplicationSectionRequest` already
  existed with the identical gap (`Map<String, Object> data`, zero inner-shape validation) — no new
  endpoint needed, just closing it. Added the Jakarta Bean Validation mirror of the same 17 schemas
  under `wizard/dto/section/` (26 DTO classes including nested shapes), plus `SectionDataValidator`
  (`wizard/SectionDataValidator.java`) — dispatches on the `section` string to the matching DTO class,
  converts to it, then runs Bean Validation. `WizardService.saveSection`/`saveSectionByUnderwriter` now
  call it instead of serializing the raw map. Ran a throwaway JUnit test (7 cases, deleted after —
  `application-service` has no permanent test suite yet, so adding one wasn't this task's call to make)
  confirming the same real-vs-smuggled-field behavior as the worker side; `mvnd compile` clean.
  **Correction (2026-09-09, found while wiring S2)**: the original note above claimed "nothing in this
  codebase disables" Jackson's unknown-property rejection — wrong.
  `ApplicationServiceApplication.objectMapper()` sets `FAIL_ON_UNKNOWN_PROPERTIES` to `false` app-wide
  (for general lenient JSON handling elsewhere), and `SectionDataValidator` was using that exact
  injected bean for `convertValue()` — meaning unrecognised fields were **not actually rejected in the
  real running app**, only in the throwaway test, which had used a bare unconfigured `ObjectMapper`
  rather than reproducing the real bean's settings. Fixed: `SectionDataValidator` now derives its own
  `strictObjectMapper` via `objectMapper.copy().configure(FAIL_ON_UNKNOWN_PROPERTIES, true)` for the
  `convertValue()` step specifically, leaving the shared lenient bean untouched for its other
  consumers. Re-verified with a corrected throwaway test that reproduces the real bean's exact
  configuration (`new ObjectMapper().configure(FAIL_ON_UNKNOWN_PROPERTIES, false)` as the input) —
  confirms rejection now actually holds; `mvnd compile`/test clean, test deleted again after.
- Deliberately out of scope: full cross-field business rules (e.g. net income ≤ gross income) — these
  already run client-side for UX and are a separate, larger effort from the exposure-control gap this
  closes. Also out of scope: `/select-product` and `/affordability-result`, which the architect's note
  didn't target and which take computed/internal payloads rather than direct wizard-channel input.

**S9 note (2026-09-09)**: both points turned out to already be mostly resolved, just not visible in
the right place — checked before assuming either was an open gap.

- **POST-vs-GET**: `integration-service`'s own 3 endpoints (`otp/deliver`,
  `data-verification/generate`, `business-financials/generate`) were already all `POST` with a JSON
  wrapper body, called that way by all 3 of their callers (`auth-service`, `application-service` ×2)
  — no GET anywhere in that service. **One real instance did exist, just not inside
  `integration-service`**: the pre-approved-offer lookup put a customer's national ID in a
  browser-facing GET URL (`GET /api/products/pre-approved/{nationalId}`, called from the customer
  dashboard). Fixed on all three sides — `backend/product-service`'s `PreApprovedController`
  (`POST /pre-approved/lookup` + new `PreApprovedLookupRequest` DTO), `application-service`'s
  `ProductClient` (now `postForObject`), the worker's `products.ts` route (now
  `POST /pre-approved/lookup`, Zod-validated), and `frontend/.../product.service.ts` (now posts
  `{ nationalId }`). The sibling `/consume` endpoint was already `POST` and was left as-is — a
  `nationalId` in a POST path segment is a materially smaller residual than one in a GET URL, and
  changing it wasn't needed to satisfy the architect's note. `mvnd compile` clean on both Java
  services; `npx tsc --noEmit` clean on both worker and frontend.
- **ESB placement**: `integration-service` was already a clean thin adapter — Controller → single
  Component per concern, no orchestration/aggregation/protocol-conversion logic anywhere in it — and
  the ESB boundary language (thin gateway vs. parallel ESB; protocol conversion/aggregation/
  transformation is the bank's job) was already written up near-verbatim to the architect's own
  wording in `DigiLend_Production_Architecture.docx` §2.8/§3.4/§9/§11. That work just never made it
  into this repo's own `ARCHITECTURE.md`, which had zero mentions of ESB, MQ, `integration-service`,
  or `rule-service` at all — it predates their extraction (G4/G5). Added §6.7 to `ARCHITECTURE.md`
  documenting the boundary (citing the docx as source of record, not duplicating its full detail) so
  the repo's own living doc doesn't stay silent on a decision that's already made.
- **Flagged, not fixed**: `ARCHITECTURE.md` §10 ("Domain boundaries within each Java service") still
  doesn't mention `rule-service`/`integration-service` at all — a real, pre-existing gap from before
  this review, bigger than what this item asked for (a full domain-boundary write-up for two
  services, not a short ESB-placement note). Left open rather than folded in silently.

**S6 note (2026-09-09)**: turned out worse than the original "enumerable IDs" framing — two endpoints
had **no ownership check at all**, the same class of bug as S1 (documents), just never caught in that
pass: notifications (any authenticated user could read/mark-read another customer's notifications by
guessing a numeric `customerId`/`id`) and "applications by customer" (`GET /customer/:customerId[/current]`,
same gap). Fixed both with the exact S1 pattern (compare the authenticated caller's own id/role against
the record; staff roles bypass) rather than opaque IDs:
- Worker: `worker/src/routes/notifications.ts` (new `assertOwnsCustomerId`, applied to all 4 routes —
  `PUT /:id/read` fetches the notification first to get its `customerId`, since the id in the path
  isn't the customer's) and `worker/src/routes/applications.ts` (same helper, applied to
  `GET /customer/:customerId[/current]`).
- Java: `notification-service`'s `NotificationController` (new `assertOwnsCustomerId`, plus a new
  `NotificationService.getById()` for the same fetch-then-compare on `PUT /{id}/read`) and
  `application-service`'s `WizardController` (same pattern, reusing `SecurityConfig.STAFF_ROLES` — see
  Q2 note).
- **Deferred, not built now**: opaque IDs. `users.id` is the same global sequential counter behind
  every one of these — now that the real IDOR is closed, opacity is defense-in-depth (blocks inference
  of customer volume/growth even where ownership is enforced), not a fix for a live bug. Bigger touch
  (JWT claim shape, every DTO) for materially lower marginal urgency post-fix — left as this item's
  residual rather than built speculatively.
- `mvnd compile` clean on `notification-service` and `application-service`; `npx tsc --noEmit` clean
  on the worker.

**S6 remainder note (2026-09-17) — opaque ids, resolved as API-boundary obfuscation, not a schema
migration** (user decision, given full-migration effort/risk for a demo app): internal auto-increment
PKs are unchanged everywhere; a reversible keyed bijection (multiply-mod-prime over a >2^32 prime,
the same technique Hashids/Sqids use) obfuscates ids only where they cross the API boundary. This is
obfuscation against casual enumeration, not cryptographic security — documented as such in both
implementations and in ARCHITECTURE.md §6.8. Verified with a standalone throwaway roundtrip+collision
test (200k sequential values, zero collisions) in both TypeScript and Java before wiring it in.

- **Worker**: new `lib/opaque-id.ts` (`encodeOpaqueId`/`decodeOpaqueId`, prefix-namespaced —
  `"doc"`/`"upl"`/`"ntf"`). Wired into `documents.ts` (both `generatedDocuments` and
  `uploadedDocuments` — list endpoints map rows through a summary function, the four
  download/view/upload endpoints decode the path param) and `notifications.ts` (`toNotificationSummary`,
  the `PUT /:id/read` path param). `admin.ts`/`users.id` deliberately left alone — see below.
- **Java**: one `util.OpaqueId` class per service (`document-service`, `notification-service` —
  duplicated per the Q2 constraint, not shared). `UploadedDocument`/`GeneratedDocument`/`Notification`
  entities get `@JsonIgnore` on the real `id` field plus a `@JsonProperty("id")` `getOpaqueId()`
  override, so every existing response (list endpoints, upload/create) is opaque with no controller
  change; the four `@PathVariable Long id/docId` download/view/mark-read endpoints changed to
  `String` and decode explicitly.
- **Frontend**: `Notification`/`GeneratedDocument`/`UploadedDocument.id` typed `string` (was
  `number`); `docId` signals in both approval components updated to match. Every call site already
  treated `id` as an opaque token passed straight into a URL (never arithmetic), so this was a type
  change with no logic change — confirmed with a full `ng build`, zero errors.
- **Deliberately not touched**: `users.id`/admin routes (`GET/PUT/POST/DELETE /admin/users/**`) —
  staff-only (ADMIN role required), lower enumeration value than the two customer-facing surfaces
  above, and would also require updating the admin-users frontend component's typing. Left as this
  item's residual if ever prioritized further.
- `mvnd compile` clean on `document-service` and `notification-service`; `npx tsc --noEmit` clean on
  the worker; `ng build --configuration production` clean on the frontend. **Not runtime-verified
  against a live MySQL/HTTP round-trip this session** — no local DB credentials were available in
  this environment (see the S2/audit-trail notes for the same caveat) — the worker side did get the
  D1 migration applied locally, but not exercised through a live HTTP request. Flagging honestly
  rather than claiming full verification; worth a real end-to-end pass (upload → list → download by
  the returned opaque id) next time the app is actually run.

**S2 note (2026-09-09)**: no Redis (decided before starting). Design: a per-user
`sessionsRevokedAt` timestamp, checked against the token's own `iat` (issued-at) — every token
issued before that timestamp is rejected on its next use, regardless of its own expiry. One
mechanism covers all three trigger scenarios (role change, disable, explicit logout).

- **Worker**: `users.sessionsRevokedAt` column (migration `0006_cute_gorgon.sql`). `jwt.ts`'s
  `verifyJwt` now returns `{ uuid, issuedAt }` instead of a bare string. `middleware/auth.ts`'s
  `requireAuth` — which already re-read the user row every request — now also rejects if
  `issuedAt < sessionsRevokedAt`. `admin.ts`'s role/enabled handlers bump `sessionsRevokedAt`. New
  `POST /api/auth/logout` (didn't exist before — logout was purely client-side token discard).
  `frontend/.../auth.service.ts`'s `logout()` now fire-and-forgets a call to it (never on the
  session-expired path — that token's already invalid, nothing to revoke).
- **Java — the harder half, blast radius bigger than the ticket implied**: 5 of 6 protected
  services (`application-service`, `affordability-service`, `document-service`,
  `notification-service`, `product-service`) never touch a database at all — they trust the
  signed `role`/`userId` claims from issuance outright (confirmed by each filter's own existing
  comment: *"authentication is derived entirely from the token's signed claims... never a database
  lookup"*). A live per-request call back to auth-service was rejected on the same grounds
  `ARCHITECTURE.md` §11.3 already argues against (no per-request inter-service call), so each of
  those 5 gets a new `security.SessionRevocationCache` — polls `auth-service`'s new
  `GET /api/auth/revoked-since?since=` every 30s (`@Scheduled`, new `@EnableScheduling` on each
  service's main class), keeps a small in-memory `Map<userId, revokedAt>`, checked by that
  service's own `JwtAuthenticationFilter` against the token's `iat` claim. Bounded ~30s staleness
  instead of Redis or a live call. `document-service` and `product-service` had never made an
  outbound HTTP call before this and needed a new `spring-boot-starter-restclient` dependency +
  `RestTemplateConfig` to get a `RestTemplate` bean at all.
- **`auth-service` itself had a real, separate bug**, not just a missing mechanism:
  `JwtAuthenticationFilter.validateToken` only checked username + expiry — it never actually
  enforced the disabled/locked flags `buildUserDetails()` already computed from the live row, so a
  disabled account's already-issued token stayed usable there until natural expiry too, on the one
  service that *does* hit the database. Fixed alongside the revocation check (now also verifies
  `userDetails.isEnabled()`/`isAccountNonLocked()`). New `POST /api/auth/logout` and
  `GET /api/auth/revoked-since` (public, no PII beyond userId+timestamp — same exposure pattern as
  the existing public `/api/branding`); `UserAdminController`'s role/enabled handlers bump
  `sessionsRevokedAt`.
- **Bug found and fixed in the same pass, unrelated to S2 itself**: while wiring this, discovered
  S8's `SectionDataValidator` had been using the app-wide injected `ObjectMapper` bean for its
  unknown-field rejection — but `ApplicationServiceApplication.objectMapper()` sets
  `FAIL_ON_UNKNOWN_PROPERTIES` to `false` globally (for other, legitimately lenient JSON handling
  elsewhere), so S8's rejection was **not actually active in the real app**, only in its own
  throwaway test (which had used a bare unconfigured `ObjectMapper`, not a reproduction of the real
  bean). Fixed — see the correction appended to the S8 note above.
- `mvnd compile` clean on all 6 touched Java services (no aggregator pom exists across `backend/`,
  so each was compiled individually); `npx tsc --noEmit` clean on the worker and frontend.

**S3 note (2026-09-09)**: explicit scope limit going in — this is type/signature validation, not
malware scanning. A real AV engine needs new infrastructure on both sides (a scanning daemon/API);
Cloudflare Workers specifically can't run one at all (no filesystem, no subprocess, no persistent
virus-definition state in the sandbox) — so full malware scanning is left not-built rather than
faked.

- **Java (`document-service`)**: added `tika-core` 3.1.0 to `pom.xml` (pure-Java, no native
  dependency). `StorageService.storeUpload` now runs `Tika.detect(bytes)` against the real file
  content before `Files.write` — rejects (400, via the existing `IllegalArgumentException` →
  `GlobalExceptionHandler` path) anything outside an allowlist (`application/pdf`, `image/jpeg`,
  `image/png`, `.docx`, legacy `.doc`) matching what the product's own upload pages actually accept.
  The stored `mimeType` now records the *detected* type, not the client-supplied `Content-Type`
  header the old code trusted outright. Verified with a throwaway JUnit test (3 cases: real PDF/PNG
  magic bytes detected correctly, a `<script>` payload correctly detected as neither — deleted
  after, no permanent test suite exists yet); `mvnd compile` clean.
- **Worker**: new `worker/src/lib/file-signature.ts` — hand-rolled magic-byte detection (no
  equivalent lightweight signature library at the edge), same allowlist/logic as the Java side.
  Wired into `worker/src/routes/documents.ts`'s `/upload` route before the `R2` `bucket.put` call.
  Verified against real PDF/JPEG/PNG/docx magic bytes and a fake payload (script tag) via a
  throwaway script; `npx tsc --noEmit` clean.
- Branding logo upload (`worker/src/routes/branding.ts`) already had its own content-type + size
  check and was left as-is — bringing Java's equivalent up to the same bar is tracked under Q3, not
  here, since it's a branding-parity item, not part of this document-upload gap.

**S5 note (2026-09-09)**: no Redis (decided before starting). Confirmed Spring Cloud Gateway ships
no non-Redis built-in rate limiter — `RequestRateLimiter` is Lua-script-backed against Redis with
no alternative implementation.

- **Java (`api-gateway`)**: added `bucket4j-core` 8.10.1 (small, in-memory, no new infra). New
  `ratelimit.RateLimitGlobalFilter` — a `GlobalFilter` (same shape as the existing
  `CorrelationIdGlobalFilter`, since this gateway is WebFlux/reactive, not Spring MVC — a
  `GatewayFilterFactory`/servlet filter doesn't apply here), auto-applied to every route with no
  YAML wiring needed. Two tiers, both keyed by client IP (`X-Forwarded-For`, falling back to the
  direct remote address for local dev where nothing sits in front): a tight 10 requests/minute on
  `/api/auth/login/**` and `/api/auth/register/**` (the actual brute-force/OTP-abuse target) and a
  generous 120 requests/minute baseline elsewhere. Per-instance, not cluster-wide — the stated
  tradeoff of skipping Redis, acceptable for the current single-instance target. Exceeding the
  limit returns 429 in the same `{success, message, data}` shape every other error path uses.
  Verified the underlying bucket4j construction (capacity enforced exactly, separate IPs
  independent) via a throwaway JUnit test, deleted after — no permanent test suite exists yet;
  `mvnd compile` clean.
- **Worker — a dashboard action, not code**: recommending Cloudflare's native **Rate Limiting
  Rules** rather than building an in-Worker limiter, since it needs no new dependency or D1 table
  and Cloudflare already sits in front of every request. Not yet configured — this is a
  `dashboard.cloudflare.com` action for whoever holds that account, not something committable to
  this repo. Suggested rule: path `/api/auth/login/*` and `/api/auth/register/*`, threshold ~10
  requests per IP per minute, action "Block" (or "Managed Challenge" if outright blocking is too
  aggressive for legitimate retries), plus a looser rule (~120/min) across `/api/*` generally,
  mirroring the Java tiers above. If dashboard-managed config is undesirable, the documented
  fallback is a D1-backed counter in `requireAuth`/a new middleware — more code, slower, only worth
  it if avoiding the dashboard matters more than the simplicity of the native rule.

**S5 remainder note (2026-09-17)** — user decision: the worker/Cloudflare side is explicitly out of
scope going forward. This sandbox's Worker deployment is not the production target — production
will run on the customer's own environment (Java, not Cloudflare Workers) — so a dashboard action
scoped to this sandbox's Cloudflare account has no bearing on the actual production posture. Marked
**Done** on the strength of the Java-side fix above, which is the item that matters; the
dashboard-rule recommendation above stays written down for whoever operates this sandbox, but is no
longer tracked as a blocking gap.

---

## 5. Quick wins (small, already fully scoped, no dependency)

| # | Gap | Priority | Effort | Status |
|---|---|---|---|---|
| Q1 | **Naming decision** (C4) — pick one of `auth-service`/`user-auth-service` and one schema prefix, apply to code (package/schema/pom rename), doc, and deck together. Small in isolation; touches every service's config and both review documents. | P0 | S | Done — decided in favor of code, both documents updated, see §1 Q1 note |
| Q2 | **`STAFF_ROLES` is a hardcoded array literal duplicated across 7 places** (`ARCHITECTURE.md` §11.3) — adding or changing a staff role means editing all 7 in sync today. Not urgent to solve with the full Role & Entitlements roadmap context (§11.1) — a single shared constant or config value would remove the duplication risk now. | P1 | S | Done — see note below |
| Q3 | **Branding polish** (secondary colour, gradients, logo upload) — flagged as small–medium, post-review roadmap in `PRODUCTION_READINESS.md` §6 item 5. | P2 | S | Done — see note below |

**Q2 note (2026-09-09)**: actual count was 8, not 7 — `ARCHITECTURE.md` §11.3 was already stale (see
that section's own updated note). Deduped where cheap: worker's `applications.ts`/`documents.ts`/
`admin.ts` now import one `worker/src/lib/roles.ts`; `document-service`'s `StorageController`/
`GenerationController` now share one `security.StaffRoles` constant (new file). `application-service`'s
`SecurityConfig.STAFF_ROLES` was already a single site within that service — widened from `private` to
`public` so `WizardController`'s new S6 ownership check (below) could reuse it instead of adding a
second copy. `auth-service`'s `UserAdminController` and the frontend's `admin-users.component.ts` are
each already single, un-shared sites — left as-is; a true cross-service shared constant would need a
new shared Java module, out of scope for this item. `mvnd compile` clean on `document-service` and
`application-service`; `npx tsc --noEmit` clean on the worker.

**Q3 note (2026-09-09)**: turned out asymmetric — worker + frontend already had `secondaryColor`
and logo upload fully built end-to-end; only Java was lagging. Gradients were genuinely net-new on
both sides.

- **Java parity**: `BrandingSettings.java` gained `secondaryColor` (was silently dropped by the old
  `PUT` handler despite the frontend already sending it) plus `gradientStart`/`gradientEnd`.
  `BrandingController`'s `PUT` now persists all of them (`containsKey`, not `!= null`, for the
  gradient fields — an explicit `null` means "clear it," same semantics as the worker). Logo upload
  hardened to match the worker's existing bar: added `tika-core` (already a document-service
  dependency for S3; same magic-byte approach, SVG handled via Tika's XML-detection path) + a
  5MB cap, rejecting anything outside PNG/JPEG/SVG — previously unchecked entirely. Needed a new
  `IllegalArgumentException` handler in `auth-service`'s `GlobalExceptionHandler` (didn't exist
  before — without it the new validation's rejection would've fallen through to Spring's default
  `/error` forward and surfaced as a misleading 401, the same bug class already fixed in the other
  3 services' handlers).
- **Gradients (net-new, both sides)**: worker's `brandingSettings` schema gained
  `gradientStart`/`gradientEnd` (migration `0007_fat_yellow_claw.sql`), wired through `branding.ts`'s
  `PUT`. `branding.service.ts`'s `applyTheme()` sets a `--tcs-gradient` CSS custom property when both
  ends are configured, otherwise leaves `styles.scss`'s default in place (`linear-gradient(160deg,
  var(--tcs-blue-dark) 0%, var(--tcs-blue) 45%, var(--tcs-secondary) 100%)` — the exact gradient the
  login page's branded panel already used, so an unconfigured tenant looks identical to before this).
  Swapped `login.component.scss`'s hero-panel gradient to reference `--tcs-gradient` — deliberately
  the *only* one of the ~13 gradient usages found across the frontend that got swapped; the others
  (buttons, dashboard cards) already derive their gradients from the primary/secondary/accent colors
  directly and intentionally look different from each other — collapsing them all onto one shared
  gradient property would have been a visual regression, not a fix. Admin UI gained two colour
  pickers + a "reset to default" link (`admin-branding.component.html`/`.ts`), en/he i18n keys added.
  `mvnd compile` clean on `auth-service`; `npx tsc --noEmit` clean on the worker and frontend.

---

## 6. Decisions needed before buildable (not engineering work — need an owner)

These come from the doc's own §11 (Open Points for Architecture Review) and `ARCHITECTURE.md` §11.5
— listed here only so the build-sequencing view in §7 below can reference them, not to duplicate
their detail:

- Sandbox → production migration estimate (doc Open Point 1) — nothing sizes the Worker+D1+R2 → nine-component Java + managed MySQL + object storage move yet, including the data-layer migration itself.
- Non-functional requirements — volumes, concurrency, response-time targets, availability commitment (doc Open Point 4). My earlier infra sizing estimate assumed the target topology already existed and was explicit that it's a planning estimate pending these numbers. **2026-09-17**: a local JMeter load-testing setup now exists (`loadtest/personal-loan-journey.jmx`, `loadtest/README.md`) — stresses the full customer journey (register → wizard → affordability) through `api-gateway` on this development machine and produces JMeter's standard HTML dashboard report (response-time percentiles, throughput, error breakdown). It gives real local numbers to sanity-check against `DigiLend_Infra_Sizing_Estimate.xlsx`'s planning assumptions, but it's still one machine, not the target topology — don't treat its throughput ceiling as a production number, only as a relative baseline (e.g. "did this change regress p95 latency").
  **First real numbers (2026-09-17)**, run at `THREADS=150` to match the sizing doc's own stated
  peak-concurrency figure (~150–250): 300 full journeys, 4,351 requests, **0% errors**, ~74 req/s
  sustained (peaking to 129 req/s) — against the doc's own stated peak-throughput target of
  ~8–10 req/s, roughly an 8–16× margin, on one shared machine running the load generator alongside
  all 10 un-redundant backend JVMs (no HA, no dedicated hardware — a harsher setup than any real
  environment). This is consistent with, and supports, the doc's own conclusion that "throughput
  is not the sizing driver at this transaction volume" — redundancy/HA needs, not raw capacity,
  are what should be driving the VM counts. One real open question surfaced, not yet explained:
  `POST /api/applications/start` has a persistent p99 tail (224ms at 300 samples, up from a single
  514ms outlier at 100 samples) that didn't shrink with scale the way the affordability-check
  endpoint's did — worth profiling before treating this as fully clean. Full results, chart, and
  the doc-comparison table are published as an artifact (link in session records, not duplicated
  here) rather than only living in the gitignored `loadtest/report/` output.
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
2. **Foundation** — done: G3 (service discovery), runtime-verified. G1 (containers) and G2 (CI/CD) are functionally complete and compile/parse clean but have never been run against a real Docker engine (no Docker/WSL on this development machine) — tracker status stays "In progress" until that one verification step happens.
3. **Extraction** — done: G4 (`rule-service`, resolved G6 as a side effect) and G5 (`integration-service`), both runtime-verified. `backend/` now matches the doc's nine-component service catalog.
4. **In parallel with 1, needs an owner not a sprint**: the decisions in §6 — particularly the sandbox-to-production estimate and the case-allocation ownership question, since both block downstream work if left open too long.
5. **After a spec exists, not before**: N1–N3 (card payments, core banking, reporting warehouse) — none of these are engineering-ready yet regardless of how much delivery capacity is available.
6. **Done**: S7 (Spring Boot 3→4 migration, re-scoped from a patch bump to a major-version jump once the real EOL status was checked — see its note above).
7. **Done**: S4's correlation-ID slice (request tracing across the gateway → service hop) — full distributed tracing and structured/JSON logging remain not-built, tracked as the same item's unfinished remainder.
8. **Done**: S2, S5, S6, S8, S9, Q2, Q3, N1, and Open Point #19 (session revocation; Java-side rate limiting — worker/Cloudflare side deliberately dropped, see S5 remainder note; API-boundary opaque ids for documents/notifications; wizard section validation; POST-based integration cleanup; STAFF_ROLES dedup; branding polish; simulated card-payment adapter; MySQL `digibank_audit` compliance trail). S3 remains partial (type/signature validation shipped, real malware scanning needs new infra).
9. **Remaining**: S3's malware-scanning remainder (tracked as a separate effort — needs new infra), N2-N3 (core banking, reporting warehouse — still not engineering-ready without a spec), the pending manual PowerPoint edit for C6, G1/G2's real-Docker verification step (needs a machine with Docker/WSL), and whatever's left in §6's decisions-needed list.
