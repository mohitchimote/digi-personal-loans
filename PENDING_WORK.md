# Pending work — one list

Written 2026-11-13 (end of day). This is the **single list** to start from. It pulls together what was
scattered across `ARCHITECTURE_REVIEW_GAPS.md`, `PRODUCTION_READINESS.md`, `PROJECT_DOCUMENTATION.md`,
`workflow-spec/CORRECTIONS.md` and today's masters / forms / letters work. Those documents are not
changed; where an item already has a detailed write-up there, this list gives the ID and points to it
instead of repeating it. What was built today is in `BUILD_NOTES_2026-11-13.md`.

How to read it: `[ ]` open, `[~]` partly done, `[?]` needs checking first (may already be fine).
Sizes (S / M / L / XL) and priorities (P0 to P2) are mine unless an old ID is quoted, in which case they
are the old document's. Tick items off here as you go, so there is one place to look.

---

## 0. Decide first (blocks other work, nothing to build)

- [ ] **Environments.** `…loans2` has its own database (`digibank2`) and bucket. Decide: keep two separate
      sets of data, or share one database and redeploy the original Worker from `dev` so both URLs run the
      same code. Sharing makes the new work visible to everyone on the original URL.
- [ ] **Lock `…loans2`.** It is public, and demo logins work there (the login code is shown on screen).
      Options: Cloudflare Access in front of it (only your email), or demo mode off with chosen logins.
- [ ] **Original Worker is on code from 2026-11-08** and on database `digibank` at migration 0018. Decide when
      it moves to the current code (needs migrations 0019 and 0020, masters and reference seeds, and the
      master-backed forms published; see `BUILD_NOTES_2026-11-13.md`).
- [ ] **Local test leftovers** (still waiting for your call): application `DGB-2026-90531` stuck IN_PROGRESS with
      one `wf_cases` row and six `wf_transitions`; application `DGB-2026-14558` and letter
      `key_features_of_the_loan` (published v2) with one issued letter, all local.
- [ ] **Roles for letters.** Entitlement `letters.issue` exists but no role has it by default (I granted
      UNDERWRITER in my local database only). Decide which roles get it and add it to the seeds.
- [ ] The decisions listed in `ARCHITECTURE_REVIEW_GAPS.md` §6 still stand and need an owner: sandbox to
      production estimate, non-functional requirements, RTO/RPO, data protection and retention, regulatory
      positioning, accessibility and RTL scope, SSO protocol, incident ownership, config-drift monitoring,
      and Bank Yahav's phase-one scope and pilot.

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

## 3. Java parity for today's work (Worker is the reference)

- [ ] Masters, master types and the public pick-list endpoints.
- [ ] Form definitions with `optionsSource`, the server-side checks on save and publish, and apply-master-sources.
- [ ] The `staff` system list (Users-backed).
- [ ] Calculated values (`calculated_json`) written on every change.
- [ ] Country, state, city and guarantor and industry fields (DTOs may still expect the old text values).
- [ ] Letters (see section 1).
- [ ] Previously open parity items in `PRODUCTION_READINESS.md` §6: Java email templates need a runtime check
      with a real Resend key, Hebrew email text was never ported, and `mvnd compile` for the email work.

## 4. Bank Yahav items (`ARCHITECTURE_REVIEW_GAPS.md` §3A)

- [ ] **Y5** Pricing ranges and deviation authority (P1, M).
- [ ] **Y6** Scorecard model registry and selection rules, configuration side only (P2, M).
- [ ] **Y7** Decline and clarification return to the branch, not the customer (P1, S).
- [?] **Y8** Conditional approval enforcement: check that conditions are tracked individually and that execution
      above the conditional amount is blocked until they are met (P1, S).
- [ ] **Y9** Bundled multi-product application, e.g. loan plus card (P2, L).
- [?] **Y10** Section-anchored notes and the customer worklist (P2, S).
- [ ] **Y12** Collateral and pledge handling (P2, M).
- [ ] **Y13** Check affordability and salary calculation against the bank's manual method (P2, S).
- Built already: Y1 to Y4 and Y11 (organisation, SLA, reassignment, branch roles and mandates, referrals).
- [ ] Also noted in `PROJECT_DOCUMENTATION.md`: "only the owner may decide a case", notifications to a newly
      assigned person, business-hours calendars, and staff-dashboard tiles still on fixed status groups.
- [ ] Customer-toned aside (Tip / Need Help) still shows in Banker mode on Review & Submit (cosmetic).

## 5. Platform, security and delivery (`ARCHITECTURE_REVIEW_GAPS.md` and `PRODUCTION_READINESS.md`)

- [~] **G1** Containers and **G2** CI/CD: written and parse clean, never run against a real Docker engine.
- [ ] **S10** Dependency and container vulnerability scanning in CI (P1, S).
- [ ] **S11** Release-artifact integrity: image digest pinning, SBOM, signing (P2).
- [~] **S3** Real malware scanning of uploads (type and signature checks are done; scanning needs new infrastructure).
- [~] **S4** Full distributed tracing (correlation ID and structured logs are done).
- [ ] **N2** Core banking integration landscape (P2, XL). Not engineering-ready until there is a specification.
- [ ] **N3** Reporting schema and data-warehouse replication (P2, L). Same.
- [ ] **C6** The manual PowerPoint edit for the architecture deck.
- [ ] Workflow: the RED-flag exception-note rule is enforced in the UI only; make it a server-side guard
      (`workflow-spec/CORRECTIONS.md`, "Not moved into the workflow").
- [ ] Load test: `POST /api/applications/start` has a persistent slow tail (p99 224 ms) that is not explained yet.
- [ ] `PRODUCTION_READINESS.md` residuals: finding 2 (ownership-check gap, matches the Worker), 7 (email-template
      escaping needed when built in Java), 8 (dependency freshness) and 9 (opaque IDs beyond documents and
      notifications).
- [ ] Client infrastructure checklist (`PRODUCTION_READINESS.md` §4) is still the client's to provision.

## 6. Housekeeping

- [ ] `seed.sql` still creates the Admin with the original demo ID; both deployed databases were changed directly to
      a different ID at your request (not recorded here), and the seed was left alone. A reseed would bring the
      old one back. Align the seed when you decide.
- [ ] Documentation is spread over many files (`ARCHITECTURE.md`, `ARCHITECTURE_REVIEW_GAPS.md`,
      `PRODUCTION_READINESS.md`, `PROJECT_DOCUMENTATION.md`, `DESIGN.md`, `PRODUCT.md` and the spec folders).
      When you are ready, fold today's notes into the right ones and retire duplicates; I left them alone.
- [ ] Push cadence: you push `dev` at the end of each day. Today's work, including the second deployment's
      config, is pushed.
