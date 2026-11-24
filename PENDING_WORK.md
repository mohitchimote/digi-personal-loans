# Pending work: the one backlog

Last reviewed 2026-11-24. This is the **single list** to start from; it replaces `ARCHITECTURE_REVIEW_GAPS.md`
(the review gap tracker, folded in here and removed) and the earlier version of this file. What exists today is
described in `PROJECT_DOCUMENTATION.md` (features) and `ARCHITECTURE.md` (structure); multi-tenancy has its own
`MULTI_TENANCY_DESIGN.md`; branches, environments and the UAT release recipe are in `BRANCHING.md`.

How to read it: `[ ]` open, `[~]` partly done, `[?]` needs checking first (may already be fine). Sizes (S / M / L / XL)
and priorities (P0 to P2) are estimates unless an old ID is quoted, in which case they come from the old tracker.
Tick items off here as you go, so there is one place to look. Items with an ID (S2, G4, Y5, ...) are the IDs cited in
code comments; section 8 explains every one of them, done or not.

---

## 0. Decide first (blocks other work, nothing to build)

- [ ] **UAT release is on hold** (your decision 2026-11-24). `dev` is 50 commits ahead of `master` and carries the
      masters, organisation, form-builder, workflow and Letters work as well as multi-tenancy, which cannot be
      separated from it. It all ships together, when you say. Already decided for that day: the 10 cases to keep
      (`worker/scripts/uat-keep.proposed.txt`) and DIGI's admin (National ID `000000015`). Still to decide:
      `DEMO_MODE` on UAT, and the e-mail for that admin (the seed uses `admin@digibank.com`). Recipe, rehearsed on
      a copy of UAT: `BRANCHING.md`, "Release: multi-tenancy to UAT".
- [ ] **Lock `...loans2`.** Its address is public, and demo logins work there (the login code is shown on screen).
      Options: Cloudflare Access in front of it (only your e-mail), or demo mode off with chosen logins.
- [ ] **Test debris on `...loans2`** from the multi-tenancy checks: six suspended test lenders (ISOA, ISOB and four more),
      their test customers and data, one disabled test admin in DIGI. There is no "delete lender" by design; decide
      whether to add a platform-only purge.
- [ ] **Local test leftovers**: application `DGB-2026-90531` stuck IN_PROGRESS with one `wf_cases` row and six
      `wf_transitions`; application `DGB-2026-14558` and letter `key_features_of_the_loan` (published v2) with one
      issued letter, all local.
- [ ] **`e2e/`** (Playwright suite and its README) is untracked: commit it, move it, or delete it.
- [ ] **Roles for letters.** Entitlement `letters.issue` exists but no role has it by default. Decide which roles
      get it and add it to the seeds.
- [ ] **"View as" is read-only** (my decision, to protect maker-checker). Confirm, or decide that support may act on
      someone's behalf (that needs its own entitlement and an audit entry per action).
- [ ] Decisions that need an owner (from the old gap tracker; none is engineering work):
  - Sandbox-to-production migration estimate: nothing sizes the Worker + D1 + R2 to nine-component Java + managed MySQL + object storage move yet.
  - Non-functional requirements: volumes, concurrency, response-time targets, availability commitment. A local JMeter set-up exists (`loadtest/`); at 150 concurrent users it showed 0% errors and about 74 requests per second against a stated peak of 8 to 10, so redundancy, not throughput, drives sizing.
  - Recovery objectives (RTO/RPO, failover, object-storage replication, rehearsal cadence).
  - Data protection and retention: encryption at rest, key rotation, cross-schema erasure, DPIA.
  - Regulatory positioning: applicable regime, affordability-evidence retention, decline explainability.
  - Environments, delivery pipeline and test strategy (largely answered once G1/G2 are verified).
  - Accessibility standard and RTL testing scope.
  - Where case allocation belongs (`ARCHITECTURE.md` §11.5; ownership and routing are built in the Worker, see §6.10 there).
  - SSO protocol (SAML 2.0, WS-Federation or OIDC) and provisioning model: designed in `ARCHITECTURE.md` §11.6, waits for the client's ADFS admin.
  - Incident ownership: who triages and escalates a security finding or outage (on-call, escalation path, severities).
  - Configuration-drift and security-posture monitoring for the on-premises DMZ estate (add to the infra checklist at the next revision).
  - Bank Yahav first-phase scope and pilot: all banker-channel customers or individuals first; pilot scope, success criteria and QA ownership; confirmed volumes and channel split.
  - Already resolved: deployment model, full stack on premises inside the client's DMZ (2026-09-28).

## 0A. Multi-tenancy follow-ups (built 2026-11-16 to 24; see `MULTI_TENANCY_DESIGN.md`)

- [ ] **Sign-in hardening, remainder:** registration messages ("already exists", "no registration found") still reveal
      whether an account exists; no rate limiting beyond the 5-attempt counter per issued code; response timing
      differs slightly between real and decoy accounts; the login code is returned to the page (demo mode) and
      there is no SMS or e-mail channel yet; no second factor for the platform super admin.
- [ ] **Offboarding:** staff access ends only when a lender admin disables the account; consider inactivity
      expiry or an access review. A lender with its own address cannot be signed in to elsewhere; lenders without one
      still work by code on shared addresses.
- [ ] **New-lender set-up gaps:** no screen to load other countries' reference data for a new lender (large masters
      are copied without items); apply-master-sources has no button (API only); lender settings (address,
      countries, currencies, locale, mail-from) have no editing screen; a lender's own web addresses need DNS and
      a certificate set up in Cloudflare by hand.
- [ ] **View as, rough edges:** a few read requests write (the data-verification summary is generated on first read);
      the underwriter's "available for new cases" toggle fails in a view; the Actions column on the Users screen is cramped.
- [ ] **Not yet viewed in Hebrew:** the platform console, the view-as banner, the lender badge and banner.
- [ ] **Tests across two lenders in the browser:** the HTTP checks (`worker/scripts/lender-isolation-check.mjs`,
      `platform-check.mjs`, `impersonation-check.mjs`) cover the API; the Playwright `e2e/` suite does not yet
      run across two lenders.
- [ ] **Cross-lender pre-approved offers, issued letters and the audit trail** are scoped by lender but have no admin
      screens that show it.
- [ ] Java services have no lenders yet (parity, section 3).

## 1. Letters (continue first)

Done: format and spec, engine, validator, rich text, storage, calculated values, PDF renderer, admin and staff
APIs, white-page editor. Still to do:

**Editor**
- [ ] Drag-and-drop reordering of blocks on the page (the Move buttons exist).
- [ ] Add and remove table rows directly on the page (today only in the Blocks view).
- [ ] Font size, text colour, justified alignment.
- [ ] Page-break block and "keep together"; a different first page.
- [ ] Saved rules: create one from a condition on the page, rename, delete (the API exists, no screen).
- [ ] Letter editor strings are English literals, not in the i18n files.
- [ ] Rename a letter, change who it applies to, delete or archive a letter (no screen).
- [ ] The frontend carries a **copy** of the format and rule engine (`frontend/src/app/core/letters/`). Add a test
      that runs the shared vectors against it so the copies cannot drift.

**Issuing and use**
- [ ] Issue-letter button and "issued letters" list on the case screen (API exists: `/api/letters/*`).
- [ ] Customer download of issued letters, with a notification when one is issued.
- [ ] Audit view of issued letters: template version, the data snapshot and which parts were shown.
- [ ] Preview and issue need real values: list which letter fields each application type can actually fill.
- [ ] **LTV** and other calculated values: there is no property value field yet. Decide the field, then calculate
      and store it (rule: calculated values are written by the backend to the application JSON).
- [ ] Free-plan CPU limit (10 ms): PDF generation exceeds it on a deployed Worker; fine locally. Decide plan or
      approach before relying on PDFs on `…loans2`.

**Content**
- [ ] The regulatory letters themselves for personal and business loans (key facts, offer, conditional approval,
      decline notice, document request). Needs wording from the bank's compliance side; the ESIS-style document
      you shared was only a concept.
- [ ] Existing offer-pack PDFs still use Helvetica: English only, no shekel sign. Move them onto the letter
      engine, or give them the Hebrew font.

**Java parity** (Worker is the reference build)
- [ ] Java vectors test (formats, rules, resolve, validate, markup) next to the workflow engine's `VectorsTest`.
- [ ] Java engine, validator and PDF drawing (iText), passing the same vectors.
- [ ] `document.schema.json` (JSON Schema for the letter format), promised in the spec.

## 2. Masters, forms and screens

- [ ] Remaining hard-coded pick-lists, parked by you for now: title, gender, residential status, source of
      income, ID document type, legal entity type.
- [ ] Cities for the 21 countries that have none (you accepted free text for now); update the city master later.
- [ ] Cities for other countries on `…loans2` (only Israel is loaded; D1 free plan allows 100,000 row writes a
      day across the account, about 165,000 rows in all). Use `node scripts/seed-reference-stage.mjs <CC…>`.
- [ ] **Documents required per loan purpose**, with a "conditionally mandatory" level and the condition for when
      it is requested. Creating a new checklist is an event and must notify the customer. Uploaded documents
      stay for audit.
- [ ] **Decline and send-back reasons** as a master: several per decision, an "Internal-only" tick, customer
      wording in English and Hebrew (feeds decline letters). Today the API takes one free-text reason, so the
      decline and send-back inputs and the workflow engine change.
- [ ] Documents checklist and the dashboard's demo branch still read masters directly (accepted exception to
      "screens talk to forms, forms talk to masters"). Revisit.
- [ ] Applications saved before today have no `state` and keep a free-text city. The customer picks them again;
      underwriters can no longer edit the city as free text. Decide whether staff need a proper city editor.
- [ ] Bank staff list needs org units linked to Branch master items; check the real organisation data.
- [ ] Form Builder: you are reviewing the master wiring; fix whatever you find.

## 3. Java parity (Worker is the reference)

- [ ] Masters, master types and the public pick-list endpoints.
- [ ] Form definitions with `optionsSource`, the server-side checks on save and publish, and apply-master-sources.
- [ ] The `staff` system list (Users-backed).
- [ ] Calculated values (`calculated_json`) written on every change.
- [ ] Country, state, city and guarantor and industry fields (DTOs may still expect the old text values).
- [ ] Letters (see section 1).
- [ ] Lenders (multi-tenancy): `lender_id` everywhere, the lender claim in the token, lender-scoped queries, host-based lender resolution, platform console, view-as. Design in `MULTI_TENANCY_DESIGN.md`.
- [ ] Previously open parity items in `PRODUCTION_READINESS.md` §6: Java email templates need a runtime check
      with a real Resend key, Hebrew email text was never ported, and `mvnd compile` for the email work.

## 4. Bank Yahav items (source: the 2026-11-03 prospect meeting)

Compared against the build by targeted code search, so "open" means no code found, not a line-by-line audit.
Integration work (DMS and archival transfer, warehouse feed, SMS gateway, scorecard API, core-banking adapters) is
deliberately not listed here: it was agreed as implementation-phase work and is covered by N2 and N3.

- [ ] **Y5** Pricing ranges and deviation authority: a rate range plus per-customer margin, deviations approved by a defined set of roles (P1, M).
- [ ] **Y6** Scorecard model registry and selection rules, configuration side only; the credit score is still synthetic (P2, M).
- [ ] **Y7** Decline and clarification return to the branch, not the customer (P1, S).
- [?] **Y8** Conditional approval enforcement: check that conditions are tracked individually and that execution above the conditional amount is blocked until they are met (P1, S).
- [ ] **Y9** Bundled multi-product application, e.g. loan plus card (P2, L).
- [?] **Y10** Section-anchored notes and the customer worklist (documents, fees, offer acceptance) (P2, S).
- [ ] **Y12** Collateral and pledge handling (P2, M).
- [ ] **Y13** Check affordability and salary calculation against the bank's manual method (P2, S).
- Built already: Y1 to Y4 and Y11 (organisation, SLA, reassignment, branch roles and mandates, referrals).
- [ ] Also noted in `PROJECT_DOCUMENTATION.md`: "only the owner may decide a case", notifications to a newly assigned person, business-hours calendars, and staff-dashboard tiles still on fixed status groups.
- [ ] Customer-toned aside (Tip / Need Help) still shows in Banker mode on Review & Submit (cosmetic).
- Demo honesty: bureau, OCR, card payment, Open Banking and credit score are simulated (`ARCHITECTURE.md` §6.3); label them as such in any demonstration.

## 5. Platform, security and delivery

- [~] **G1** Containers and **G2** CI/CD: written (Dockerfile per service, `docker-compose.yml`, three GitHub Actions workflows) and they parse clean, but never run against a real Docker engine or on GitHub Actions. Run `docker compose up --build` on a machine with Docker, and push to watch the Actions tab, before calling them done.
- [ ] **S10** Dependency and container vulnerability scanning in CI (P1, S).
- [ ] **S11** Release-artifact integrity: image digest pinning and SBOM (can start now), signing (needs a registry and key-management decision) (P2).
- [~] **S3** Real malware scanning of uploads (type and signature checks are done; scanning needs new infrastructure).
- [~] **S4** Full distributed tracing (the correlation ID and structured JSON logging are done).
- [ ] **N2** Core banking integration landscape: Product Sync, Customer Information File, CASA accounts, disbursements, collateral (P2, XL). The largest unscoped item; not engineering-ready until there is a specification and an owner.
- [ ] **N3** Reporting schema and data-warehouse replication, including masking personal data in the copy (P2, L). Same.
- [ ] **C6** The manual PowerPoint edit for the architecture deck (the six-schema table omits `digibank_rules`, and §7.1 and open point 3 still describe rule-service thresholds as unbuilt). The deck and docx are not in this repository.
- [ ] Workflow: the RED-flag exception-note rule is enforced in the UI only; make it a server-side guard (`workflow-spec/CORRECTIONS.md`, "Not moved into the workflow").
- [ ] Load test: `POST /api/applications/start` has a persistent slow tail (p99 224 ms at 300 samples) that is not explained yet.
- [ ] `PRODUCTION_READINESS.md` residuals: finding 2 (ownership-check gap, matches the Worker), 7 (e-mail template escaping when built in Java), 8 (dependency freshness) and 9 (opaque IDs beyond documents and notifications).
- [ ] Client infrastructure checklist (`PRODUCTION_READINESS.md` §4) is still the client's to provision.

## 6. Housekeeping

- [ ] `seed.sql` creates the Admin with the original demo ID `000000015` and lender 1; hand-changed databases do not follow it. Align the seed when you decide.
- [x] Documentation consolidated 2026-11-24: one backlog (this file), build notes folded into `PROJECT_DOCUMENTATION.md` and `ARCHITECTURE.md`, design material grouped in `design-exploration/`, a root `README.md` as index.
- [ ] Push cadence: you push `dev` at the end of each day.

## 7. Where the old tracker went

`ARCHITECTURE_REVIEW_GAPS.md` was a long work log (what was changed, how each item was runtime-verified, two
false alarms that were ruled out). Section 8 keeps what is needed to read the code comments; the narratives are in
git history: `git log --diff-filter=D --format=%h -- ARCHITECTURE_REVIEW_GAPS.md` gives the commit that removed it,
and `git show <that commit>^:ARCHITECTURE_REVIEW_GAPS.md` prints the last version.

## 8. Reference: the IDs cited in code comments

IDs come from the architecture review of 2026-09-01 and its follow-ups (a deck and a document that are not in this
repository). "Done" means built and runtime-verified, not just compiled.

**Corrections to the review deck and document (C)**

| ID | What | Status |
|---|---|---|
| C1 | Deck claimed end-to-end request correlation | Fixed in the deck, then made true by S4's correlation ID |
| C2 | Doc listed offer-pack generation as "not built" | It is built in both runtimes; doc corrected. Every document but the approval letter still carries placeholder legal text |
| C3 | Deck and doc claimed case assignment as current | It was not built then; docs corrected. Now built in the Worker (Y3) |
| C4 | Three different names for the auth service and its schema | Done (see Q1) |
| C5 | Rule-service ownership of thresholds correctly hedged | No action |
| C6 | Deck and doc omit the `digibank_rules` schema | Doc fixed; the deck still needs the manual edit (section 5) |

**Quick wins (Q)**

| ID | What | Status |
|---|---|---|
| Q1 | One name: `auth-service` and the `digibank_auth` schema, applied to code, doc and deck | Done |
| Q2 | `STAFF_ROLES` literal duplicated in 8 places | Done where cheap: one shared constant per service (a cross-service constant would need a shared Java module). The Worker now recognises staff from the roles table |
| Q3 | Branding polish: secondary colour, gradients, logo upload | Done |

**Foundation and extraction (G), Java side**

| ID | What | Status |
|---|---|---|
| G1 | Dockerfile per service, `docker-compose.yml` | Written, never run on a Docker engine (section 5) |
| G2 | CI/CD: backend, frontend and Worker workflows | Written, never run on GitHub Actions (section 5) |
| G3 | Service discovery (Eureka) instead of hard-coded gateway routes | Done |
| G4 | `rule-service` extracted (mandates, affordability rules) | Done |
| G5 | `integration-service` extracted (OTP, OCR, bureau, Open Banking, card seams) | Done |
| G6 | Persist mandate and affordability rules in Java | Done as part of G4 |

**Security and reliability (S)**

| ID | What | Status |
|---|---|---|
| S1 | Document IDOR: ownership check plus opaque ids | Done |
| S2 | Session and token revocation (`sessionsRevokedAt`; Java side polls a cache, no Redis) | Done |
| S3 | Upload content checks | Partly: type and signature checks done; malware scanning open |
| S4 | Correlation id and structured logging | Partly: both done; full distributed tracing open |
| S5 | Rate limiting | Done on the Java gateway (in-memory bucket4j filter, no Redis); the Worker side was deliberately not pursued |
| S6 | Sequential ids as public identifiers | Done: opaque ids at the API boundary for documents and notifications |
| S7 | Spring Boot upgrade | Done (a major-version migration, not a patch bump) |
| S8 | Shape validation on wizard section saves | Done: one schema per section, both stacks |
| S9 | POST-not-GET for banking integrations; `integration-service` stays thin | Done (mostly true already, one gap fixed) |
| S10 | Dependency and container vulnerability scanning in CI | Open (section 5) |
| S11 | Release-artifact integrity (digest pinning, SBOM, signing) | Open (section 5) |

**Net-new scope (N)**

| ID | What | Status |
|---|---|---|
| N1 | Card payments | Done as a simulated adapter; the real processor decision is deferred |
| N2 | Core banking integration landscape | Open, needs a specification |
| N3 | Reporting schema and warehouse replication | Open, needs a specification |

**Bank Yahav meeting (Y)**: Y1 organisational hierarchy, Y2 SLA monitoring, Y3 reassignment and routing, Y4 branch roles and mandates with context and Y11 referral chain of custody are **built** (2026-11-06, Worker only, see `PROJECT_DOCUMENTATION.md` §1.3.2 and §1.3.3). Y5 to Y10, Y12 and Y13 are open (section 4).

**Other**: "Open Point #19" in code comments is the compliance audit trail (MySQL `digibank_audit` on the Java side, the `audit_log` table in the Worker; `ARCHITECTURE.md` §6.9). Done.
