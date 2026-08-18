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
  **Mandate limits are enforced client-side only** — the same as the original Java version, ported
  as-is rather than hardened, since changing this would be a scope decision, not a lift-and-shift.
  Not a security boundary as implemented, flagged deliberately.
- **`applications.ts`'s routes carry no server-side auth check at all** — this exactly mirrors the
  original `application-service`, which had no `SecurityConfig`/JWT filter of its own either (only
  `auth-service` did). Preserved intentionally for behavioral parity during the port rather than
  silently tightened, but worth knowing if extending this module: unlike `admin.ts`/`auth.ts`
  (which do enforce `requireAuth`/`requireRole`), anyone who can reach the Worker can call any
  `/api/applications/*` endpoint directly.
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

- **Mandate limits are not a security boundary** — enforced client-side only (§5).
- **`applications.ts` has no server-side auth check at all** — ported as-is from the original
  `application-service`, which had the same gap (§5).
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
