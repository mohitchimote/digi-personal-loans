# DigiBank Personal Loans — Architecture

> **Maintenance contract**: this document describes durable structure — service topology, data
> ownership, request flow, security model, and cross-cutting architectural patterns. It changes
> **only when the architecture itself changes** (a new service, a new data-ownership boundary, a
> new cross-cutting pattern). Feature-by-feature functional changes, screen-by-screen journey
> detail, and day-to-day "what shipped" notes belong in [`PROJECT_DOCUMENTATION.md`](./PROJECT_DOCUMENTATION.md),
> which is updated regularly. If you're about to add a paragraph here describing a new wizard step
> or a new admin field, it almost certainly belongs there instead.

---

## 1. System context

A full-stack demo of digital loan origination for DigiBank (Israel) — two parallel journeys
(personal and business loans) across customer, underwriter, and admin portals.

**Migrated to Cloudflare Workers, August 2026** (see §1.1) — originally built as 7 Java Spring
Boot microservices behind an API gateway (August 2026's git history before the migration commits
still shows that version, and `backend/` in the repo is that original implementation, kept as
reference/rollback, no longer deployed). Rebuilt as a single Cloudflare Worker for a one-week
sandbox-testing deadline: no server to host or keep alive, deploys as one unit with the frontend,
runs on Cloudflare's free tier. The description below is the **current, deployed** architecture.

```
                                   ┌──────────────────────────────┐
                                   │      Browser (any device)     │
                                   └────────────────┬───────────────┘
                                                    │ one origin, no CORS
                                                    ▼
                                   ┌──────────────────────────────┐
                                   │   Cloudflare Worker            │
                                   │   (worker/src/index.ts)        │
                                   │                                │
                                   │  Static Assets binding          │
                                   │  → Angular build (dist/)        │
                                   │  serves everything except       │
                                   │  /api/* (run_worker_first)      │
                                   │                                │
                                   │  Hono router → /api/*           │
                                   │  auth · applications ·          │
                                   │  affordability · products ·     │
                                   │  documents · notifications      │
                                   └──────┬───────────────┬─────────┘
                                          │               │
                                          ▼               ▼
                                   ┌────────────┐  ┌────────────┐
                                   │  D1 (SQLite) │  │  R2 (blobs) │
                                   │  13 tables,  │  │  generated   │
                                   │  one database│  │  PDFs +      │
                                   │              │  │  uploads     │
                                   └────────────┘  └────────────┘
```

One Worker process, one D1 database, one R2 bucket — no gateway, no inter-service HTTP calls.
Route handlers that used to call another Java service over `RestTemplate` (e.g. auto-approval
reading affordability rules, or an application reading a pre-approved offer) now just query the
relevant D1 table directly in the same request (see `worker/src/lib/*.ts`), since everything lives
in one process.

### 1.1 Migration from the original Java architecture

The original implementation was 7 independent Spring Boot services (gateway + 6) behind an API
gateway, each with its own MySQL schema — see §1.2 below for that topology, kept for reference
since `backend/` still contains it untouched on this branch. It was ported feature-for-feature to
a single Cloudflare Worker (`worker/`) over 5 days, in this order: auth-service → application-
service (the 29-endpoint wizard engine) → affordability-service + product-service → document-
service + notification-service + the two "fake it" generators → frontend rewiring. Every business
rule, validation, and calculation was read from the Java source and ported deliberately, not
reimplemented from the functional spec — see git history on the `cloudflare-workers-migration`
branch for the day-by-day record, including the handful of real bugs the port caught (e.g. a
missing `approvedAmount` column, a type mismatch between what Angular sends and what a hand-ported
endpoint assumed).

**What changed:**
- 7 services + gateway → 1 Worker with an internal router (Hono), no gateway needed since there's
  only one deployable.
- MySQL, one schema per service → D1 (SQLite), one database, tables namespaced by domain instead
  of by schema (`loan_applications`, `underwriting_notes`, `loan_products`, etc. — see §3).
- Local filesystem (`document-store/`, `branding-store/`) → R2 for generated PDFs and uploaded
  documents.
- Two previously in-memory, resets-on-restart Spring `@Component` beans (`AffordabilityRules`,
  `MandateRules`) → persisted D1 tables (`affordability_rules`, `mandate_rules`) — a strict
  improvement, not a scope change: same admin-editable behavior, but now survives a redeploy.
- Java Bean Validation (`@Valid`) → Zod schemas at the route boundary.
- iText PDF generation → `pdf-lib` (had to swap the ₪ symbol for "NIS" in PDF letters only — the
  standard PDF font has no glyph for U+20AA; the JSON API and Angular UI still use ₪ everywhere).
- `.\start-all.ps1` + 7 PowerShell windows → `wrangler dev`, one process.

**What didn't change:** every functional behavior described in `PROJECT_DOCUMENTATION.md` — the
wizard flow, the skip-forward mechanic, the guarantor rule, the mandate hierarchy, the "fake it"
simulations, i18n, the Banker identity facade. This was a lift-and-shift of behavior, not a
redesign; §1.2 and this section exist so the *plumbing* history is traceable, since the functional
document deliberately doesn't repeat it.

### 1.2 Original Java architecture (reference only — not deployed)

```
                                   ┌────────────────────────┐
                                   │   Angular SPA (:4200)   │
                                   │  standalone components, │
                                   │  signals, EN/HE i18n    │
                                   └────────────┬────────────┘
                                                │ all calls go through
                                                ▼
                                   ┌────────────────────────┐
                                   │   API Gateway (:8080)   │
                                   │ Spring Cloud Gateway —  │
                                   │ path-based proxy + CORS │
                                   └────────────┬────────────┘
                                                │
        ┌──────────────┬──────────────┬─────────┴────────┬───────────────┬────────────────────┐
        ▼              ▼              ▼                  ▼               ▼                    ▼
┌──────────────┐┌──────────────┐┌──────────────────┐┌──────────────┐┌──────────────┐┌────────────────────┐
│ auth-service ││application-  ││affordability-svc  ││product-svc   ││document-svc  ││notification-svc    │
│   :8081      ││service :8082 ││     :8083         ││   :8084      ││   :8085      ││     :8086          │
│ digibank_auth││digibank_app  ││  stateless,       ││digibank_     ││digibank_docs ││digibank_           │
│              ││              ││  no DB —          ││product       ││              ││notifications       │
│              ││              ││  rules in memory  ││              ││              ││                    │
└──────────────┘└──────────────┘└──────────────────┘└──────────────┘└──────────────┘└────────────────────┘
```

7 backend processes (gateway + 6 services), each an independent Spring Boot application with its
own MySQL schema. Still present in `backend/` on this branch as a reference/rollback, but not what
`wrangler deploy` ships — see §1 above for the deployed architecture.

## 2. Tech stack (current — Cloudflare Workers)

| Layer | Choice |
|---|---|
| Backend runtime | Cloudflare Workers (V8 isolates), TypeScript |
| Backend framework | Hono (routing/middleware) |
| Data access | Drizzle ORM over D1 (SQLite) |
| Validation | Zod |
| Auth | `jose` (JWT, HS256, 24h expiry) — National ID + OTP, no passwords anywhere in the system |
| File storage | R2 (generated PDFs, uploaded documents) |
| PDF generation | `pdf-lib` |
| Outbound email | Resend HTTP API (`worker/src/lib/email.ts`) — event notification emails only, not OTP |
| Frontend | Angular 22, standalone components (no NgModules), signals for local state |
| Frontend styling | Plain CSS custom properties for theming, Material Icons, self-hosted Inter font |
| Deployment | `wrangler deploy` — one Worker serves the Angular build (Static Assets binding) and `/api/*` (Hono) from the same origin |

<details>
<summary>Tech stack — original Java implementation (reference only)</summary>

| Layer | Choice |
|---|---|
| Backend | Java 21, Spring Boot 3.2.5, built/run via mvnd (Maven Daemon) |
| Backend persistence | MySQL, one schema per service, Hibernate `ddl-auto: update` |
| Gateway | Spring Cloud Gateway, pure path-based proxy, no business logic |

</details>

## 3. Service catalog (current — one Worker, routed internally)

Everything below is one Cloudflare Worker (`worker/src/index.ts`) and one D1 database
(`digibank`) — "service" here means a Hono sub-router (`worker/src/routes/*.ts`), not a separate
deployable. No gateway, no inter-service network calls.

| Route module | Mounted at | D1 tables it owns | Responsibility |
|---|---|---|---|
| `auth.ts` / `admin.ts` / `branding.ts` | `/api/auth/**`, `/api/branding/**` | `users`, `faqs`, `branding_settings` | Registration, National ID + OTP login/verify, JWT issuance, role-gated admin user/FAQ management, branding. |
| `applications.ts` | `/api/applications/**` | `loan_applications`, `underwriting_notes`, `mandate_rules` | The wizard engine: section save/read, status transitions, underwriting notes, decisions, disbursement, mandate rules, Data Verification, Business Financials Intelligence. |
| `affordability.ts` | `/api/affordability/**` | `affordability_rules` | DTI/HTI/DSCR calculation, pass/fail decisioning, admin-editable rule thresholds (persisted, not in-memory). |
| `products.ts` | `/api/products/**` | `loan_products`, `pre_approved_offers`, `product_selections` | Loan product catalog, eligibility filtering, pre-approved-offer lookup, admin CRUD. |
| `documents.ts` | `/api/documents/**` | `generated_documents`, `uploaded_documents` (blobs in R2) | Generated PDFs (approval letters) + customer-uploaded supporting documents. |
| `notifications.ts` | `/api/notifications/**` | `notifications` | In-app customer notification feed. |
| `admin-email-templates.ts` | `/api/auth/admin/email-templates/**` | `email_templates` | Admin CRUD over per-event email templates; rendering + Resend delivery lives in `lib/email.ts`, called from `applications.ts`'s lifecycle handlers, not from this router. |

No routing table is needed the way the old API gateway had one — Hono's router dispatches
directly based on the path, all within the single Worker.

<details>
<summary>Original Java service catalog + gateway routing table (reference only)</summary>

| Service | Port | Owns (DB) | Responsibility |
|---|---|---|---|
| `api-gateway` | 8080 | none | Path-based routing + CORS. |
| `auth-service` | 8081 | `digibank_auth` | Identity, JWT issuance, branding, FAQs. |
| `application-service` | 8082 | `digibank_app` | Wizard engine, decisions, disbursement, mandates. |
| `affordability-service` | 8083 | *(stateless)* | DTI/HTI/DSCR, in-memory rule thresholds. |
| `product-service` | 8084 | `digibank_product` | Product catalog, eligibility, pre-approved offers. |
| `document-service` | 8085 | `digibank_docs` | Generated PDFs + uploaded documents (local filesystem). |
| `notification-service` | 8086 | `digibank_notifications` | In-app notification feed. |

| Path prefix | Routed to |
|---|---|
| `/api/auth/**`, `/api/branding/**` | auth-service |
| `/api/applications/**` | application-service |
| `/api/affordability/**` | affordability-service |
| `/api/products/**` | product-service |
| `/api/documents/**` | document-service |
| `/api/notifications/**` | notification-service |

</details>

## 4. Data architecture

### 4.1 One D1 database, tables namespaced by domain

The original Java version had database-per-service isolation (7 separate MySQL schemas). The
Workers version deliberately simplifies this to **one D1 database** with tables grouped by domain
instead of by schema (`users`/`faqs` for auth, `loan_applications`/`underwriting_notes` for the
wizard engine, `loan_products`/`pre_approved_offers` for products, etc. — see §3's table). This is
a scope-appropriate simplification, not an oversight: database-per-service isolation was never
load-bearing for correctness here, and D1 (SQLite) doesn't have MySQL's separate-schema-per-
database model to begin with. Route modules still only touch their own tables by convention (e.g.
`applications.ts` never writes to `loan_products`), preserving the same ownership boundaries in
code even though they now share one physical database.

### 4.2 JSON-blob-per-section (`applications.ts` / `loan_applications` table)

The `loan_applications` D1 table has one row per application, with **one nullable `TEXT` column
per wizard step** holding that step's data as a raw JSON blob (e.g. `personal_details_json`,
`income_employment_json`, `business_financials_json` — see `worker/src/db/schema.ts`). A single
generic endpoint, `PUT /api/applications/{appRef}/section` (body: `{ section, data }`), serializes
whatever object it's given into the matching column (`worker/src/lib/sections.ts`'s
`columnForSection`).

This is the load-bearing architectural decision in the whole system, and it's the one part of the
port that translated almost mechanically from MySQL's `TEXT` columns to SQLite's — every
wizard-shape change to date (consent step insertion, address history, multiple employments, joint
bank connections, the entire business-loan journey, guarantor flow, business financials
intelligence) shipped as a **pure additive change**: add a new column, add a new section key to
the ordered list below, done. No migration of *existing* data, no route/schema churn beyond that
one column. (One honest process difference from the Java version: adding the column itself now
means running `drizzle-kit generate` + `wrangler d1 migrations apply` — a small, explicit step,
versus Hibernate's `ddl-auto: update` silently auto-adding it. Still no hand-written migration SQL
for the common case.)

Two parallel ordered section lists drive the wizard, selected by `applicationType`
(`PERSONAL`/`BUSINESS`), both in `worker/src/lib/sections.ts`:

- `ALL_SECTIONS` (personal)
- `BUSINESS_SECTIONS` (business)

These lists feed three functions: `nextSection()` (what the wizard advances to after a save),
`calculateCompletion()` (the % shown in sidebar/dashboard), and the internal `isSectionFilled()`
(the skip-forward mechanic described in §6.1).

### 4.3 Joint-applicant convention

Any section supporting a second applicant keeps applicant 1's fields flat at the top level and
nests applicant 2 under an `applicant2` key. Every read-only summary view (review-submit,
view-application, underwriter case-detail) only ever reads the flat top-level fields — so adding
joint-applicant support to a new section never requires touching those views.

## 5. Security architecture

- **No passwords anywhere.** Every role (customer, business owner, the 5-tier underwriter
  hierarchy, admin, banker) authenticates with **National ID + a 6-digit OTP**. There is no
  password field on the `users` table. The one exception: a Banker-created customer account
  (`register-by-staff`) is pre-verified with no OTP step at all — the Banker has already confirmed
  identity by phone/in branch — but the customer still logs in via the normal National ID + OTP
  flow afterward.
- **JWT**: HS256, 24h expiry, subject = a generated `uuid` — never the customer's National ID or
  email, so neither credential is embedded in the token itself. Signed/verified via `jose`
  (`worker/src/lib/jwt.ts`), checked on every request by `requireAuth` middleware
  (`worker/src/middleware/auth.ts`), which loads the current user row from D1 by that `uuid`.
- **OTP delivery is demo-only**: no SMS/email provider is integrated; the code is echoed back in
  the API response (`demoOtp`) and shown on-screen with a "Demo Environment" banner
  (`worker/src/lib/otp.ts`). This is the single clearest "swap before production" seam in the
  system.
- **Route guards** (frontend, unchanged by the migration): `authGuard` (`/portal/*`),
  `businessGuard` (`/business/*`), `underwriterGuard` (`/underwriter/*`, admits all 5
  underwriter-hierarchy roles), `adminGuard` (`/admin/*`), `bankerGuard` (`/banker/*`),
  `assistGuard` (`/banker/case/:appRef/apply/*` — additionally requires
  `EntitlementsService.canActAsCustomer`, currently true only for `BANKER`).
  **Mandate limits are enforced client-side only in the Worker** — ported as-is from the original
  Java rather than hardened, since changing this would be a scope decision, not a lift-and-shift.
  Not a security boundary as implemented here, flagged deliberately. **`backend/` (Java) now
  enforces this server-side** (`application-service`'s `approveByUnderwriter`, fixed 2026-08-28) —
  see `PRODUCTION_READINESS.md` §5's mandate-limit section. The Worker was not similarly hardened
  (out of scope for the frontend/backend handover this document supports).
- **`applications.ts`, `documents.ts`, `products.ts`, `affordability.ts`, and `notifications.ts`
  now require auth** (`requireAuth` on every route, `assertRole(...STAFF_ROLES)` on staff-only
  endpoints) — this was a real gap through most of the port (originally mirroring
  `application-service`, which never had its own `SecurityConfig`/JWT filter either), closed in
  commit `c883eeb` ("Require authentication across the API and cap upload sizes", 2026-08-18). It
  had allowed anonymous requests to upload to R2, download other customers' documents by guessing
  IDs, edit the product catalog, and call underwriting decisions. **`backend/` (Java) went without
  the equivalent fix until 2026-08-28** — see `PRODUCTION_READINESS.md` §5 for the fix and its
  runtime verification.
- **Banker-only endpoints** (`worker/src/routes/auth.ts`, enforced via `requireAuth` +
  `requireRole("BANKER")` middleware): `POST /api/auth/register-by-staff` (creates a pre-verified
  customer account) and `GET /api/auth/customer-profile/{id}` (looks up a customer's own profile
  for wizard prefill — see §6.6). Both are genuine server-side role checks, not client-side-only
  like mandate limits. `admin.ts`'s routes similarly require `requireRole("ADMIN")`.
- **Server-side validation**: Zod schemas at the route boundary (e.g. `auth.ts`'s
  `registerSchema`) + a global `AppError` → structured JSON error response
  (`app.onError` in `worker/src/index.ts`); business-rule violations throw `AppError(message,
  status)`, defaulting to 400.

## 6. Cross-cutting architectural patterns

These are reusable mechanics, not one-off feature code — recognize them before reaching for a new
approach to a similar problem.

### 6.1 Skip-forward wizard sections

`worker/src/lib/sections.ts`'s internal `isSectionFilled(app, section)` decides, per section, whether the wizard can
skip past it. Originally built so the **pre-approved fast-track** (§ "Pre-approved" in
PROJECT_DOCUMENTATION) could pre-fill most of an application and jump straight to Review & Submit
while still stopping at a fixed `MANDATORY_STOPS` set (`personalDetails`, `connectBank`,
`reviewSubmit`). The **guarantor** flow reuses the exact same mechanic with a different boolean:
`guarantorDetails` is "filled" (skippable) unless `guarantorRequired` is true and
`guarantorDetailsJson` is still null. Any future "conditionally ask for X" requirement should
extend this mechanic rather than invent a new conditional-routing system.

### 6.2 appRef-aware vs. "current application" components

Customer-facing pages default to `ApplicationService.getCurrent(customerId)` — the customer's
**most recently updated** application. That's correct for the in-flow wizard (only one active
draft ever exists) but wrong for any page meant to show a *specific* application once a customer
has more than one (e.g. one approved, one still in progress).

The established fix pattern: check `route.snapshot.paramMap.get('appRef')` first, fall back to
`getCurrent(customerId)` if absent — so a component that doesn't pass an appRef behaves exactly as
before. Components already following this pattern: `PortalComponent`, `ViewApplicationComponent`,
`ApprovalComponent`, `ReviewSubmitComponent`/`BusinessReviewSubmitComponent`,
`AffordabilityResultsComponent`/`BusinessAffordabilityResultsComponent`,
`ProductsComponent`/`BusinessProductsComponent` — the last three were audited and fixed as part of
extending the Banker assist flow through to submission (§6.6): they now check
`EffectiveIdentityService.appRef` (which is non-null only while a Banker is assisting) before
falling back to `getCurrent(customerId)`, so they remain correct for both a normal customer with
multiple applications and a Banker pinned to one specific case.

### 6.3 The "fake it" pattern (demo-only synthesis, seeded for stability)

Several features simulate a real integration that doesn't exist yet, using a deterministic seed
(usually `applicationRef.hashCode()` or a National-ID-derived hash) so the *same* application
always produces the *same* synthetic output — stable across reloads, but different across
applications, so a live demo never looks hardcoded to one persona. Generate-once-then-persist is
the standard implementation: compute on first access, store the result in a new nullable JSON
column, return the stored value on every subsequent read.

Current instances of this pattern:

| Feature | Where (post-migration) | Persisted to |
|---|---|---|
| Data Verification (RAG discrepancy checks) | `worker/src/lib/data-verification.ts` | `data_verification_json` |
| Business Financials Intelligence (P&L/Cashflow/Ratios/Risk Grade) | `worker/src/lib/business-financials.ts` | `business_financials_analysis_json` |
| Synthetic credit score default | `CreditDeclarationsComponent`/`BusinessCreditDeclarationsComponent` (frontend, unchanged) | `credit_declarations_json`/`business_credit_declarations_json` |
| Open Banking connection summary | `connect-bank`/`business-connect-bank` components (frontend, unchanged) | `bank_connection_json`/`business_bank_connection_json` |
| Pre-approved customer accounts/balances | `DashboardComponent.buildRelationshipAccounts()` (frontend, unchanged) | not persisted — recomputed per render from a seeded PRNG |
| National ID registry lookup tick | `personal-details.component.ts` (frontend, unchanged) | not persisted — UI-only simulation |

The backend generators (`data-verification.ts`, `business-financials.ts`) use a small seeded PRNG
(`worker/src/lib/seeded-random.ts`, `mulberry32`) in place of Java's `new Random(seed)` — the
contract that matters ("same `applicationRef` always produces the same output") is preserved
exactly; bit-identical output to the old Java version was never a requirement and isn't the case.

When adding a new "fake it" feature, follow this table's shape rather than inventing a new
generation/caching strategy.

### 6.4 Bureau-scale vs. internal lender-grade scores

Customers see and edit credit scores on **real bureau scales** — FICO-style 300-850 (personal),
Dun & Bradstreet Commercial Delinquency Score 1-100 (business, higher = lower risk). Internally,
every eligibility/affordability threshold (`ProductService.isEligible`, `AffordabilityService`,
`BusinessAffordabilityService`, `AffordabilityRules.minCreditScore`) is still written against a
1-9 **internal lender risk grade** — a completely different, underwriter-only number.

The conversion lives entirely on the **frontend**, as pure functions in
`frontend/src/app/core/utils/credit-score.util.ts` (`ficoToLenderGrade`,
`dnbScoreToLenderGrade`, `dnbScoreToRiskClass`), applied at the point a product-eligibility or
affordability-check request is built. This keeps the backend's internal grading thresholds
completely untouched when the customer-facing scale changes — if the bureau scale ever needs to
change again, only this one utility file and the two slider ranges need editing. The derived
grade (and, for business, D&B's own 1-5 Risk Class) is rendered **only** on the underwriter
case-detail Credit & Risk tab — never sent to or shown to the customer.

### 6.5 i18n

Every user-facing string goes through `'key.path' | translate` (or `I18nService.t()` in
TypeScript) against parallel `en.ts`/`he.ts` dictionaries with `{{param}}` interpolation. Hebrew is
RTL. Bilingual labels are always two dictionary entries, never one string with both languages
concatenated.

### 6.6 Identity facade for assisted (Banker) applications

The Banker role needed the *exact same* wizard step components a customer uses (so dropdown
constraints, joint-applicant reveals, and validators never drift between the two), without a
single `*ngIf="isBanker"` inside any of them. The fix was to make "whose identity is this form
operating on" a question answered by one injected facade, not by branching inside ~20 components:

- **`AssistContextService`** — holds the active "Banker acting as customer X" target as a signal
  (`{ customerId, customerEmail, appRef, applicationType, customerFullName, customerPhone,
  customerNationalId, customerIdIssueDate, customerCompanyName }` or `null`).
- **`EffectiveIdentityService`** — the facade every wizard component injects instead of
  `AuthService` directly. Pass-through to `AuthService` for a normal customer; while assisting,
  resolves `userId`/`userEmail`/`appRef` to the assisted customer's, and resolves the
  convenience-prefill getters (`userPhone`, `userNationalId`, `userIdIssueDate`, `userFullName`,
  `companyName`) from the assisted customer's *own* profile — never the Banker's.
- **`assistContextResolver`** (route resolver, not a component's `ngOnInit`) — fetches the
  application **and** the customer's profile (`GET /api/auth/customer-profile/{id}`), then calls
  `AssistContextService.start(...)`, attached to `case/:appRef/apply`'s `resolve` config. This
  matters structurally: resolvers block child-route activation until they complete, whereas
  starting the assist context from a component's `ngOnInit` races the child wizard step's own
  `ngOnInit` and can lose — this exact race was hit once during development (silently fell back to
  the Banker's own identity, spawning a stray draft application under the Banker's account instead
  of editing the customer's).
- **`EntitlementsService`** — single source of truth for what a role can do
  (`canActAsCustomer`, `canFreelyNavigateSections`), computed from `AuthService.role`. The seam for
  any future "staff sees an extra field/menu" requirement: add a flag here and one `*ngIf` at the
  call site, not a parallel component.
- **Dense vs. customer template, same component**: each wizard step component keeps one
  `FormGroup`/validator set/save method, with two `*ngIf` template blocks
  (`*ngIf="!identity.isAssisting"` / `*ngIf="identity.isAssisting"`) — the customer's step-wizard
  chrome (Tip/Need Help aside, marketing copy) vs. a dense 3-column label+field grid for the
  Banker. Zero logic duplication; only presentation differs.

**Apply this pattern, don't reinvent it**, for any future "staff member acts on behalf of a
customer" feature (e.g. underwriter-assisted edits) — inject `EffectiveIdentityService`, extend
`AssistTarget`/`EntitlementsService` if new fields/permissions are needed, and add a route resolver
rather than starting context from a component.

## 7. Frontend architecture

- **Standalone components throughout** (no NgModules), signals for local component state,
  reactive forms for every wizard step.
- **Routing** (`app.routes.ts`): guarded as described in §5; several pages accept an optional
  `:appRef` param per §6.2.
- **`ApplicationService`** (Angular service, not to be confused with the old Java service of the
  same name): thin HTTP wrapper over every `/api/applications/*` endpoint, plus
  `getResumeRoute(app)` — one shared function (used by both the dashboard and the sidebar
  application switcher) mapping an application's status to where a click on it should go.
- **`AuthService`**: JWT/session in `localStorage`, exposes `userId`/`userEmail`/`role` etc. as
  getters off a `currentUser` signal.
- **`api-base.ts`**: post-migration, this is just `export const API_BASE = ''` — the Worker serves
  the Angular build and `/api/*` from the same origin, so every service's relative URL
  (`` `${API_BASE}/api/...` ``) already resolves correctly with no environment detection. Used to
  branch on hostname (`localhost` / GitHub Codespaces / other) to find the separately-hosted Java
  gateway; that branching is gone, not just simplified.

## 8. Local development (current — Cloudflare Workers)

```bash
# Terminal 1 — the Worker (API + would-be-static-assets), from worker/:
npx wrangler dev --port 8787

# Terminal 2 — Angular dev server, from frontend/ (proxy.conf.json forwards /api to :8787):
npm start
```

Requires: Node.js, a Cloudflare account authenticated via `wrangler login` (only needed for
`--remote` D1/R2 operations and `wrangler deploy`; plain `wrangler dev` runs entirely against
local Miniflare-emulated D1/R2, no account needed for day-to-day iteration).

**Database**: local D1 is a SQLite file under `worker/.wrangler/state/`, created automatically.
Apply schema + seed data once:

```bash
cd worker
npm run db:migrate:local
npm run db:seed:generate && npm run db:seed:local
```

`npm run db:seed:generate` regenerates `seed.sql` from `scripts/seed-generate.ts` (the source of
truth for demo data — edit the script, not the generated SQL). The same seed script targets
`--remote` via `db:seed:remote`. `scripts/cleanup-test-data.sql` resets a database (local or
remote) back to just the seed data — safe to re-run between demo sessions.

**Deploy**: `npx wrangler deploy` from `worker/` — ships the current Angular build (run `npm run
build` in `frontend/` first if it's changed) and the Worker code together, to
`https://digibank-personal-loans.mohit-chimote.workers.dev`.

Seeded accounts, pre-verified — log in with National ID, then the on-screen OTP:
`admin@digibank.com` (National ID `000000015`), `underwriter@digibank.com` (National ID
`000000014`), `banker@digibank.com` (National ID `000000027`).

<details>
<summary>Original Java local development (reference only)</summary>

```powershell
.\start-all.ps1
```

Single command: backend (one window per service, all via mvnd) + frontend (`ng serve`, bound to
`0.0.0.0:4200`). Required JDK 21+, Maven Daemon (`mvnd`), a running local MySQL instance.

</details>

## 9. Known architectural gaps (not bugs — deliberate scope cuts)

- **Mandate limits are not a security boundary in the Worker** — enforced client-side only (§5).
  ~~In `backend/` (Java)~~ — fixed 2026-08-28, `application-service` now rejects an
  `approveByUnderwriter` call server-side if the amount exceeds the caller role's mandate limit.
- ~~`backend/` (Java) has no server-side auth on 5 of its 6 services~~ — fixed 2026-08-28, ported
  the Worker's `requireAuth`/`assertRole` pattern into all 5 services as Spring Security +
  a stateless JWT filter. See `PRODUCTION_READINESS.md` §5.
- **No per-role underwriting queue** — all 5 approver roles (`UNDERWRITER` → `CEO`) share one
  pipeline/case-detail shell; `referToSeniorUnderwriter()` sets a generic status with no
  "referred to which specific role" chain-of-custody field.
- **No real third-party integrations** anywhere — OTP delivery, Open Banking, national ID registry
  lookup, and document OCR/extraction are all simulated (§6.3). Each is called out in code
  comments as a clear "swap here" seam.
- **Single D1 database, not database-per-service** — a deliberate simplification made during the
  Workers migration, not an oversight (§4.1).
- **R2/D1 usage isn't capped** — both are on Cloudflare's free tier, sized generously for sandbox
  testing (10GB R2 storage, millions of D1 rows/month), but Cloudflare doesn't offer a hard
  spending cap the way some cloud providers do. Not a real risk at demo traffic levels; worth
  knowing before scaling this beyond a sandbox.
- **PDF letters render "NIS" instead of "₪"** — the standard PDF font (`pdf-lib` + Helvetica) has
  no glyph for the ₪ Unicode character (U+20AA); everywhere else (JSON API, Angular UI) still uses
  ₪. Fixable by embedding a Unicode-capable font if it matters for a specific demo.

**Resolved by the migration, not carried forward**: `AffordabilityRules`/`MandateRules` used to be
in-memory Spring beans that reset on every service restart — they're now persisted D1 tables
(`affordability_rules`, `mandate_rules`), so admin edits survive a redeploy. Listed here only so
anyone comparing against the pre-migration document doesn't go looking for this gap and wonder if
it regressed.

## 10. Domain boundaries within each Java service (bounded contexts)

`backend/`'s 7 services (§1.2) are physical *deployment* boundaries — one process, one port, one
database schema each. That's a different question from *domain* boundaries: several of these
services bundle more than one bounded context behind a single deployable, and it's worth naming
those contexts explicitly rather than leaving them implicit in a flat `service/`/`controller/`
package. Two reasons this matters:

1. **A future need to split one out (scale, team ownership, a distinct compliance SLA) becomes a
   mechanical extraction** — move a package, stand up a new `pom.xml`, register a new gateway
   route — **if the context already has a clean internal boundary**, rather than an untangling
   exercise through code that assumes everything is one process.
2. **It's evidence of deliberate design for an architectural review** — a reviewer can see the
   seams were chosen on purpose, not discovered by accident later.

The reverse move — physically splitting a service into more deployables *today* — is deliberately
**not** recommended here. `PRODUCTION_READINESS.md` §2/§3 documents why: no service discovery
(`api-gateway`'s routes are hardcoded to fixed `localhost:808x`), no containerization, no CI/CD.
Every additional physical service multiplies that same operational gap before the foundation to
support it exists — more surface area for a deployment mishap, not less. The right move now is
internal (package-level) separation; the physical split is a decision for whenever a concrete
trigger below actually shows up.

### `application-service` — 5 contexts, repackaged 2026-08-28 (the most overloaded service)

The largest split of this pass — the old 710-line `ApplicationService` genuinely interleaved all
five contexts, unlike `affordability-service`'s clean two-way read-only split. Real cross-context
calls stay as injected-service calls (the sanctioned pattern, same as calling another deployable
via `client/`), never method calls reaching into another context's private state:
`wizard.WizardService` calls `decisioning.DecisioningService.maybeAutoApprove()` right after a
product is selected; both `wizard` and `decisioning` call `audittrail.AuditTrailService.addNote()`
for their audit-trail side effects. This is a one-directional dependency graph (wizard →
decisioning → audittrail), not a cycle.

| Context | Owns | Key classes (post-repackage) | Extraction trigger |
|---|---|---|---|
| Wizard / section engine | Section save/read, skip-forward mechanic, start/resume, joint-applicant handling | `wizard.WizardService`, `wizard.WizardController`, `wizard.dto.*`, `model.LoanApplication` | Rarely changes independently of decisioning today — low priority to split. |
| Decisioning & mandates | Approve/decline/refer/disbursement, mandate-limit enforcement (§5) | `decisioning.DecisioningService`, `decisioning.DecisioningController`, `decisioning.MandateRules` | If underwriting ever needs its own release cadence/on-call ownership separate from the customer-facing wizard, or a dedicated audit/compliance data store. |
| Audit trail | Underwriting notes — the record of who did what, when | `audittrail.AuditTrailService`, `audittrail.NotesController`, `model.UnderwritingNote` | If notes need independent retention/compliance rules from the application data they're attached to. |
| Data verification | Simulated RAG discrepancy-check generator, now behind a port (§6.3-equivalent "fake it" pattern) | `dataverification.DataVerificationService` (orchestrator), `dataverification.DataVerificationPort` (interface), `dataverification.SimulatedDataVerificationAdapter` (today's only implementation) | The clearest future split — this is a placeholder for a real document-AI/OCR integration; when built, it's a second `DataVerificationPort` implementation, not a rewrite (PRODUCTION_READINESS.md §7). |
| Business financials intelligence | Simulated P&L/cashflow/risk-grade analysis, same port pattern | `businessfinancials.BusinessFinancialsAnalysisService`, `businessfinancials.BusinessFinancialsPort`, `businessfinancials.SimulatedBusinessFinancialsAdapter` | Same shape as data verification — a real integration (core-banking/credit-bureau feed) becomes a second port implementation. |

`client/` (`AffordabilityClient`, `DocumentClient`, `NotificationClient`, `ProductClient`,
`NotificationText`) isn't a domain of its own — it's the existing anti-corruption-layer pattern for
calling the other services (plus one small shared notification-text formatter used by both
decisioning and audittrail), and any newly-extracted context should integrate the same way rather
than reaching into another context's tables directly. `security.CurrentUser` is a similarly
cross-cutting one-liner (reads the authenticated principal from `SecurityContextHolder`), used by
every controller that needs the caller's real identity instead of a client-supplied
"reviewedBy"/"editedBy" field.

Runtime-verified after the move: booted the service against a real MySQL instance and replayed a
full request chain spanning all five contexts — create an application (wizard), save a section
(wizard), generate data-verification and business-financials results (both via their new ports),
attempt a mandate-exceeding approval as `UNDERWRITER` with a forged reviewer name (rejected `400`,
decisioning + mandate check), a within-limit approval (accepted, `200`), confirmed the audit note
recorded the token's real identity, not the forged one (audittrail, cross-context call from
decisioning), and confirmed a `CUSTOMER` token is still blocked (`403`) from the staff-only pipeline
endpoint (decisioning). `mvnd compile` clean on the first pass.

### `affordability-service` — 2 contexts (repackaged 2026-08-28, the proof of concept for this section)

This is the service the user flagged directly, and the first one given real internal package
boundaries rather than just being named in a table — see `com.digibank.affordability.rules` and
`com.digibank.affordability.assessment`.

| Context | Owns | Key classes (post-repackage) | Extraction trigger |
|---|---|---|---|
| Rules administration | Admin-editable thresholds (DTI/HTI/credit score/auto-approval) | `rules.AffordabilityRules` (mutable bean), `rules.AffordabilityRulesView` (read-only interface), `rules.RulesController` (`GET`/`PUT /rules`) | If rule *versioning* or a rule-change audit trail is added (flagged by the user in review, 2026-08-28) — that's naturally a separate concern from evaluating a request against whatever the current rules are. |
| Assessment | Stateless DTI/HTI/DSCR calculation against current rules, personal + business | `assessment.AffordabilityService`, `assessment.BusinessAffordabilityService`, `assessment.AssessmentController` (`POST /check`, `/check-business`), `assessment.dto.*` | If assessment volume/latency needs independent scaling from how often rules change (rules change rarely; assessment runs on every affordability check). |

The boundary is real, not just a folder name: `assessment.AffordabilityService` depends on
`rules.AffordabilityRulesView` — a read-only interface exposing only the six getters it actually
uses — not the mutable `rules.AffordabilityRules` bean directly. The assessment context has no way
to reach in and change a rule while evaluating a request; only `rules.RulesController` (holding the
concrete class) can mutate. Endpoint paths, request/response shapes, and role gating are all
unchanged — this was a pure internal reorganization, runtime-verified against a live instance
(full auth matrix + both assessment endpoints) after the move, see `PRODUCTION_READINESS.md` §7.

### `product-service` — 3 contexts, repackaged 2026-08-28

| Context | Owns | Key classes (post-repackage) | Extraction trigger |
|---|---|---|---|
| Catalog & eligibility | Product definitions, eligibility filtering, admin CRUD | `catalog.CatalogService`, `catalog.CatalogController`, `model.LoanProduct` (shared with selection — see below) | Low priority — catalog data changes rarely and cheaply. |
| Pre-approved offers | Existing-customer fast-track offers (§6.3-adjacent "fake it" pattern) | `preapproved.PreApprovedOffer`, `preapproved.PreApprovedOfferService`, `preapproved.PreApprovedController` | If a real pre-approval feed replaces the seeded demo data — similar shape to data-verification's trigger above. |
| Product selection | Which product+term an application picked | `selection.ProductSelection`, `selection.SelectionService`, `selection.SelectionController` | Tightly coupled to the wizard engine in `application-service` (§6's asymmetry note) — not a good split candidate on its own. |

`LoanProduct`/`LoanProductRepository` stay at the top-level `model`/`repository` packages (not owned
by catalog exclusively) since `selection.SelectionService` also reads them to look up the chosen
product by code — same shared-entity reasoning as `application-service`'s `LoanApplication`.
`RepaymentCalculator` (top-level) is the shared amortisation math all three contexts use. Runtime
-verified: full matrix across all three contexts against live MySQL (eligibility check, admin CRUD
role-gated correctly, pre-approved offer lookup, product selection + read-back). `mvnd compile` clean.

### `document-service` — 2 contexts, repackaged 2026-08-28

| Context | Owns | Key classes (post-repackage) | Extraction trigger |
|---|---|---|---|
| Document generation | Server-generated PDFs (approval letters, and the KFS/repayment-schedule/T&Cs pack once ported from the Worker — §6 parity backlog) | `generation.PdfGeneratorService`, `generation.GenerationService`, `generation.GeneratedDocument` | If PDF generation becomes CPU/latency-heavy enough to want independent scaling from upload/download traffic. |
| Document storage & retrieval | Customer-uploaded supporting documents | `storage.StorageService`, `storage.UploadedDocument` | If storage moves off local disk to an object store (S3/Azure Blob/GCS) — that's naturally a different lifecycle from generation. |

`PathSafety` (top-level) is the shared path-traversal-prevention helper both contexts need
(PRODUCTION_READINESS.md §5, finding 3) — `applicationRef` is attacker-influenced and used as a
filesystem directory segment in both. A real bug was caught and fixed while runtime-verifying this
split: an invalid `applicationRef` threw uncaught, which Spring's default `/error` forward doesn't
carry the original `Authorization` header through, so it re-entered the security filter chain
unauthenticated and came back as a misleading `401` instead of the real `400` — pre-existing since
the path-traversal fix itself, not introduced by this repackage, but only surfaced once this pass
actually exercised that error path. Fixed with a `GlobalExceptionHandler` (same shape as
`application-service`'s), confirmed the `400` is now correct and normal upload/generate/view/
download flows are unaffected. `mvnd compile` clean.

### `auth-service` — 4 contexts, repackaged 2026-08-28

| Context | Owns | Key classes (post-repackage) | Extraction trigger |
|---|---|---|---|
| Identity & auth | Registration, National ID + OTP login, JWT issuance | `identity.AuthController`, `identity.AuthService`, `identity.OtpService`, `model.User` (shared with staff/user admin — see below) | This is the one context every other service depends on (it issues the tokens everyone else validates) — keep it deployed early/independently reliable regardless of anything else here. |
| Staff/user administration | Admin user list, staff account creation, role/enable-disable management | `staffadmin.UserAdminController` | Low priority — low traffic, tightly coupled to the `User` table identity already owns. |
| Branding | Per-tenant logo/color/theme settings | `branding.BrandingController`, `branding.BrandingSettings` (moved fully into this package — not shared elsewhere) | If this app is ever white-labeled for multiple customers simultaneously (one deployment, many tenants) — branding-per-tenant is a natural service of its own at that point. |
| FAQs | Customer-facing support content | `faqs.FaqController` (both the public read and admin CRUD, previously split across two other controllers), `faqs.Faq` | Low priority — small, rarely-changing content. |

`model.User`/`repository.UserRepository` stay top-level (shared by identity + staffadmin).
`dto.ApiResponse` (shared response envelope) and `config.DataSeeder` (bootstraps both `User` and
`Faq` rows, so it doesn't belong to either context alone) also stay top-level. Runtime-verified with
a **real login round-trip**, not crafted tokens — since this service is the token issuer, that was
the meaningful test: requested a real OTP for the seeded admin account, verified it, got back a
real JWT with correct `role`/`fullName`/`userId` claims, then used that live token against public
branding, staff-only user list (401 without it, 200 with it, real seeded data returned), and FAQ
admin endpoints. `mvnd compile` clean.

### `notification-service` — 1 context (no split needed)

Already single-concern: the in-app notification feed, nothing else. This is the shape the other
services' contexts should look like once cleanly separated — worth pointing to as the existing
positive example rather than something to change.

### `api-gateway`

Not a domain owner — pure path-based routing + CORS (§1.2, §2). No bounded-context question
applies here.

## 11. Future domain map: workforce identity & access vs. case orchestration (roadmap, 2026-08-28)

§10 describes what exists today. This section is different in kind: it names bounded contexts for
capabilities that don't exist yet — role/entitlement management, branch and back-office hierarchy,
employee locations, profile editing, case auto-allocation, claim/return-to-pool, out-of-office
handling, supervisor mapping and drill-down, per-application task tracking — raised in review as a
connected set, explicitly acknowledged as roadmap rather than work to start now. The point of
writing it down before any of it is built is the same reason §10 exists: so each piece lands in the
right place the first time, instead of getting bolted onto whichever service looks closest when the
request lands.

**The one decision that matters more than any individual context's placement**: this whole list
splits into two domains with different rates of change and different owners, and conflating them
into "user-service" would weld together a slow-changing HR-like domain and a fast-changing
operational one.

- **Workforce identity & access** — who your people are, what they're allowed to do, how they're
  organized. Changes slowly (an org chart doesn't get restructured daily).
- **Case orchestration** — how work gets routed to those people once they exist. Changes with
  operational tuning (allocation rules, capacity, SLAs) far more often than the org chart does.

### 11.1 Workforce identity & access — grows inside `auth-service`

These all share the `User` aggregate `auth-service` already owns (`model.User`,
`repository.UserRepository`, §10) — natural siblings of the 4 contexts already there
(`identity`, `staffadmin`, `branding`, `faqs`), not a reason to stand up a new deployable.

| Context | Covers | Future home | Depends on |
|---|---|---|---|
| User profile | Editing profile attributes beyond auth credentials (contact details, employment details, location assignment) — distinct from `identity` so a profile edit never touches login/credential logic | `auth-service.profile` | `model.User` |
| Role & entitlements | Role catalog **and feature-level entitlements per role** — not just the role name each service already checks, but *what a role is actually allowed to do*, admin-configurable | `auth-service.entitlements` | `model.User` (role field) |
| Org structure & hierarchy | Branch hierarchy, back-office hierarchy, employee→location mapping, supervisor mapping (reporting lines) | `auth-service.orgstructure` | `model.User` (identifies the employee) |
| Availability | Out-of-office toggle — a staff member's own self-service signal that case-allocation reads to skip them | `auth-service.availability` (or folded into `orgstructure` if it stays this small) | `model.User` |

### 11.2 Case orchestration — belongs near `application-service`, reads workforce data as a client

The queue itself is `application-service`'s data (`decisioning.getPipeline()`/`getBankerQueue()`
already exist, §10) — these contexts extend that, they don't replace it. Cross-domain reads to the
workforce side go through the same `client/`-package pattern already established for every other
inter-service call in this codebase (§10's `application-service` section) — no new integration
style to invent.

| Context | Covers | Future home | Depends on |
|---|---|---|---|
| Case allocation | Auto-allocation, claim-from-pool, send-back-to-pool | `application-service.allocation` (working assumption — see 11.5) | `decisioning` (the queue), workforce's `orgstructure` + `availability` (who's eligible right now) |
| Task management | Task/checklist items per application, assigned to a staff member by ID | `application-service.tasks` | `wizard`/`decisioning` (the application the task is attached to), workforce's `identity` (assignee, by `userId` — same pattern as `reviewedBy`/`createdBy`, §5) |
| Supervisor drill-down | **Not a data owner** — a query composing "whose reports" (workforce's `orgstructure`) with "what are they working on" (`decisioning`'s queue data). Same shape as the frontend's existing `EffectiveIdentityService` composition (§6.6), just server-side. | No dedicated package — a query/read-model over the two domains above | `orgstructure`, `decisioning` |

### 11.3 A concrete gap, surfaced now, not roadmap

Wiring role-gating this session (§5, finding 1) left `STAFF_ROLES` as an identical hardcoded array
literal duplicated across all 6 protected services' `SecurityConfig` classes plus
`staffadmin.UserAdminController` — 7 places that must be edited correctly, in sync, to add a role or
change who counts as staff. This is exactly the problem the Role & Entitlements context (11.1)
exists to solve, and it's worth deciding the fix shape now even though the context itself is
roadmap:

1. **Entitlements stays the source of truth; each service gets a synced/generated constant**
   (compile-time codegen, or a config fetch at startup) — closest to today's pattern, most
   mechanical to introduce.
2. **Push entitlements into the JWT itself as a `permissions` claim at issuance** — the same
   mechanism `role`/`userId`/`fullName` already use (`identity.AuthService.buildAuthResponse()`,
   §5). Services check permissions, not hardcoded role-name lists, and stay fully stateless — no
   service ever calls back to `auth-service` to ask "can this role do X," matching this codebase's
   established no-inter-service-call-per-request principle better than option 1.

Recommendation: **option 2**, when this gets built. It requires no new runtime dependency between
services (unlike option 1's config-fetch-at-startup), and every service that validates the JWT
today already knows how to read an extra claim.

### 11.4 Extraction triggers (same discipline as §10)

None of §11.1/§11.2's contexts should become their own physical deployable *by default* — the same
reasoning as §10 applies (no service discovery, no containerization, no CI/CD; more deployables
multiply that gap before there's a foundation for it). Named triggers, so a future "should we split
this out" conversation has a concrete answer instead of a vibe:

- **Role & entitlements** → its own service if entitlement rules become complex enough to need
  their own audit/compliance trail independent of `auth-service`'s release cadence (e.g. a
  regulator wants entitlement-change history as a first-class, separately-retained record).
- **Org structure & hierarchy** → its own service if it starts being sourced from an external HR
  system (Workday, SAP SuccessFactors, etc.) instead of being edited directly here — at that point
  it's an integration seam, not app logic, same shape as §10's data-verification/business
  -financials ports.
- **Case allocation** → its own service if allocation logic becomes rules-engine-driven and needs
  to evolve/scale independently of the wizard/decisioning release cycle (11.5 has more on this).
- **Task management** → low priority; tightly coupled to the application it's attached to, similar
  to §10's verdict on `product-service`'s `selection` context.

### 11.5 Open question: where does case allocation actually belong?

Flagged deliberately unresolved — reasonable to place on either side, and the answer should come
from whoever owns delivery of this feature, not be assumed here:

- **Argument for `application-service`** (11.2's working assumption): the queue is
  `application-service`'s data; allocation is one more thing that happens to an application in the
  queue, alongside decisioning.
- **Argument for the workforce side**: allocation is fundamentally about staff capacity/eligibility
  — an org-structure/availability computation that happens to act on case IDs — and could apply to
  more than loan applications if this platform ever grows other case types.

Whichever side it lands on, it depends on the other via the established `client/`-package pattern —
this doesn't change the integration shape, only which service owns the allocation *decision* versus
which one just supplies eligibility data.

### 11.6 SSO / ADFS integration (staff login only) — raised in review, 2026-08-28

Not a new domain — a new *front door* into the `identity` context already in 11.1/§10. Confirmed
in review that it maps this way, not as its own context:

- **Staff-only, by design.** Customers authenticate with National ID + OTP (self-service, not in
  DigiBank's corporate AD, §5). ADFS federation applies only to `STAFF_ROLES` — the customer login
  path is untouched. This boundary should stay explicit wherever the SSO work actually lands, not
  get assumed away later.
- **Converges on the existing token-issuance path, not a parallel one.**
  `identity.AuthService.buildAuthResponse()` (§5) is the one place that mints the internal JWT
  today — both OTP login and staff registration already call it. The design: a new
  `identity.sso.SsoCallbackController` handles the ADFS redirect callback, validates the
  assertion/token (signature, issuer, audience) against ADFS's federation metadata, resolves it to
  a local `User` (by email/UPN or an immutable NameID), then calls the same `buildAuthResponse()`.
  **Nothing downstream changes** — every other service keeps validating the same HS256 JWT with the
  same `role`/`userId`/`fullName` claims exactly as it does today; ADFS is contained entirely
  inside `identity` and never talks to any other service.
- **Protocol is an open question, not a default.** ADFS supports SAML 2.0, WS-Federation, or OIDC
  depending on version/configuration. OIDC is the better fit for this codebase's stateless-JWT
  architecture (JSON claims, no XML/certificate ceremony) if the customer's ADFS (2016+) is
  configured for it; SAML 2.0 is the fallback for older deployments. Confirm with the customer's
  ADFS admin before building — don't default to one.
- **AD group claims must not become the app's role directly.** The `UNDERWRITER` →
  `SENIOR_UNDERWRITER` → `HEAD_OF_LENDING` → `COO` → `CEO` mandate hierarchy (§5, §9) is a
  banking/case-management concept AD doesn't natively encode — collapsing it onto AD group
  membership means an unrelated AD change silently changes someone's lending authority. Keep them
  decoupled: ADFS resolves *who* someone is; role/entitlement assignment stays under this app's own
  control (11.1's Role & Entitlements context, `staffadmin` today) via an explicit,
  admin-configured mapping, never a pass-through.
- **Provisioning model is a policy decision, not a technical one** — flagged, not resolved here:
  does a successful ADFS login auto-create a local `User` on first sign-in (JIT), or must an admin
  pre-create the staff account via `staffadmin.CreateStaffRequest` first, with ADFS only allowed to
  authenticate an already-known email? Pre-provisioned matches how staff account creation already
  works today (an admin explicitly grants access); JIT is less admin overhead but means AD alone
  gates who can reach the app. Needs an explicit decision before this is built, not a default.
- **Frontend implication.** Staff SSO needs a full-page redirect (`window.location`, not an API
  call the SPA makes directly) — the browser has to physically navigate for the SAML/OIDC redirect
  dance to work. This means a "Sign in with company account" entry point on `login.component.ts`
  separate from the customer OTP form, not an extension of it.
- **Infra dependency** — see `PRODUCTION_READINESS.md` §4: ADFS relying-party/client registration,
  metadata and signing-certificate exchange, and redirect URI registration are the customer's
  IT/security team's responsibility to provision, the same category as WAF/load balancer.
