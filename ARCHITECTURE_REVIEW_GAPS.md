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
| C1 | Technical Architecture slide: "End-to-end request correlation (txn ID)" under Observability | **I put this in the deck myself, unverified** — it's stylistically lifted from the reference DigiHome diagram, not something that exists. `PRODUCTION_READINESS.md` §2 confirms directly: no correlation/trace-ID propagation exists across the gateway → service hop in either runtime. Remove the claim or build the capability (§4 below). | P1 | Not started |
| C2 | Doc §10 lists "Full offer-pack document generation" as a **planned extension, not yet built** | It's already built in both runtimes — `worker/src/lib/document-pack.ts` and Java's `document-service.generation.GenerationService.generateOfferPack()` both produce approval letter + Key Facts Statement + Repayment Schedule + Terms & Conditions (`PRODUCTION_READINESS.md` §6 item 3). The real gap is that every document but the approval letter carries placeholder legal content pending real Israeli legal/compliance review — §10 should say that, not "not yet built." | P2 | Not started |
| C3 | Functional slide, Underwriter Workbench: "Case assignments (auto and manual allocations)"; doc §2.5 states the same as a *current* capability | Grepped the entire codebase — zero case-assignment/allocation logic exists anywhere. `ARCHITECTURE.md` §11.5 explicitly records this as an **open, unresolved architectural question** (which service should even own it), not a built feature — and the same document's own §10 (Planned Extensions) correctly lists it as not built. §2.5 contradicts §10 of its own document. Fix §2.5 to describe the pipeline as it exists today (one shared queue, no allocation) and move the assignment description fully into §10. | P0 | Not started |
| C4 | Naming: doc uses `auth-service`/`DigiLend_auth`; deck uses `user-auth-service`/`DigiLend_user-auth`; **actual code** uses `auth-service`/`digibank_auth` | Three different names for the same thing, not two — the doc's own Open Point 2 only catches the deck-vs-doc mismatch, not that neither matches code. See §5 (naming decision) below — this needs one decision applied to code, doc, and deck together. | P0 | Not started |
| C5 | Doc §7.1: rule-service is described as the eventual owner of affordability thresholds, "an open point for this review" | Correctly hedged in the doc already (§11 open point 3) — no correction needed, listed here only so it's cross-referenced from one place. See §2 below. | — | N/A |

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
| G3 | **Introduce service discovery** — `api-gateway` hard-codes `localhost:8081`–`8086` (`PRODUCTION_READINESS.md` §3). Either externalize routes to environment-specific config plus a load balancer, or bring in Eureka/Consul — an architecture decision, not a lift-and-shift. | P0 | M | — | Not started |
| G4 | **Extract `rule-service`** — new Spring Boot module; move `MandateRules`, `AffordabilityRules` (currently in-memory in `application-service`/`affordability-service`) behind it; every current caller becomes a real internal REST call instead of a local method call. Resolves doc Open Point 3 along the way (does it need a persistent schema?). | P1 | L | G1–G3 | Not started |
| G5 | **Extract `integration-service`** — new Spring Boot module; move the OTP/OCR/credit-bureau/Open-Banking adapter seams (today: `DataVerificationPort`/`BusinessFinancialsPort` in `application-service`, OTP delivery in `auth-service`) behind it. | P1 | L | G1–G3 | Not started |
| G6 | **Persist `MandateRules`/`AffordabilityRules` in Java** regardless of G4's timing — both are still plain in-memory `@Component` singletons that reset on every restart. The Worker side already fixed the equivalent gap during its own migration (`ARCHITECTURE.md` §9 — now persisted D1 tables); Java hasn't caught up. This can and should happen before or independently of the full `rule-service` extraction. | P0 | S | — | Not started |

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
| S1 | **Document IDOR** — an authenticated customer can download another customer's document by guessing a sequential `docId`/`id`. True in both the Worker and Java (`PRODUCTION_READINESS.md` §5 finding 2) — not a Java regression, but real in the system being reviewed. Fix: opaque IDs and/or an ownership check comparing the token's `userId` to the document's `customerId`. | P0 | S | Not started |
| S2 | **No session/token revocation** — JWTs are stateless, 24h, no refresh or blacklist. If a staff member's role changes or they leave, their token is valid until natural expiry. (Doc Open Point 9.) | P1 | M | Not started |
| S3 | **No malware/content scanning on uploads** — path-traversal is fixed (`PRODUCTION_READINESS.md` §5 finding 3); nothing inspects file content or type before storage. (Doc Open Point 7.) | P1 | M | Not started |
| S4 | **No distributed tracing, no correlation ID, no structured logging** — see C1 above. Needed for both the deck's own claim to become true and for any real multi-service debugging once `rule-service`/`integration-service` exist. | P1 | M | Not started |
| S5 | **No gateway-level rate limiting** — Spring Cloud Gateway's `RequestRateLimiter` needs Redis, which isn't present; nothing throttles a client anywhere in the app layer (`PRODUCTION_READINESS.md` §2/§4 — correctly scoped as partly a client-infra WAF/edge concern, but the Redis-backed in-app option is also just absent). | P2 | M | Not started |
| S6 | **Numeric sequential IDs used as public identifiers** — makes S1 trivially enumerable once authenticated. Opaque-ID hardening touches every DTO/repository that exposes these fields (`PRODUCTION_READINESS.md` §5 finding 9, LOW, explicitly deferred). | P2 | M | Not started |
| S7 | **Spring Boot 3.2.5 is several patch releases behind current** — no CVE research done; recommend a deliberate, tested bump rather than folding into another change, given there's no CI/test suite yet to catch a regression (`PRODUCTION_READINESS.md` §5 finding 8). | P2 | S | Not started |

---

## 5. Quick wins (small, already fully scoped, no dependency)

| # | Gap | Priority | Effort | Status |
|---|---|---|---|---|
| Q1 | **Naming decision** (C4) — pick one of `auth-service`/`user-auth-service` and one schema prefix, apply to code (package/schema/pom rename), doc, and deck together. Small in isolation; touches every service's config and both review documents. | P0 | S | Not started |
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

1. **Now, in parallel, no dependencies**: Q1 (naming), G6 (rules persistence in Java), S1 (document IDOR), C3/C1/C2 (fix the three deck/doc inaccuracies so the review package is accurate while the rest of this executes).
2. **Foundation, next**: G1 → G2 → G3 (containers, CI/CD, service discovery) — everything else in §2 is blocked on this by design, not by convenience.
3. **Once the foundation exists**: G4 and G5 (the actual `rule-service`/`integration-service` extraction) become close to mechanical, per `ARCHITECTURE.md` §10's own description of why the internal seams were built this way.
4. **In parallel with 2–3, needs an owner not a sprint**: the decisions in §6 — particularly the sandbox-to-production estimate and the case-allocation ownership question, since both block downstream work if left open too long.
5. **After a spec exists, not before**: N1–N3 (card payments, core banking, reporting warehouse) — none of these are engineering-ready yet regardless of how much delivery capacity is available.
