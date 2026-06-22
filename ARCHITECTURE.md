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

7 backend processes total (gateway + 6 services), each an independent Spring Boot application
with **its own MySQL schema** — no service reaches into another's database. Cross-service calls go
through plain `RestTemplate` HTTP clients (e.g. `application-service`'s `AffordabilityClient`,
`ProductClient`, `DocumentClient`, `NotificationClient`), never direct DB access.

## 2. Tech stack

| Layer | Choice |
|---|---|
| Backend | Java 21, Spring Boot 3.2.5, built/run via **mvnd** (Maven Daemon) |
| Backend persistence | MySQL, one schema per service, Hibernate `ddl-auto: update` (no Flyway/Liquibase — demo-grade, not for production) |
| Frontend | Angular 22, standalone components (no NgModules), signals for local state |
| Frontend styling | Plain CSS custom properties for theming, Material Icons, self-hosted Inter font |
| Auth | JWT (HS256, 24h expiry), National ID + OTP — no passwords anywhere in the system |
| Gateway | Spring Cloud Gateway, pure path-based proxy, no business logic |

## 3. Service catalog

| Service | Port | Owns (DB) | Responsibility |
|---|---|---|---|
| `api-gateway` | 8080 | none | Path-based routing + CORS. The only inbound door from the frontend. |
| `auth-service` | 8081 | `digibank_auth` | Identity: registration, National ID + OTP login, JWT issuance, branding config, FAQs. |
| `application-service` | 8082 | `digibank_app` | The wizard engine: `LoanApplication` entity, section save/read, status transitions, underwriting notes, decisions, disbursement, mandate rules, data verification, business financials analysis. |
| `affordability-service` | 8083 | *(stateless)* | DTI/HTI/DSCR calculation, pass/fail decisioning, admin-editable rule thresholds (in-memory). |
| `product-service` | 8084 | `digibank_product` | Loan product catalog, eligibility filtering, pre-approved-offer lookup. |
| `document-service` | 8085 | `digibank_docs` | Generated PDFs (approval letters, agreements) + customer-uploaded supporting documents. |
| `notification-service` | 8086 | `digibank_notifications` | In-app customer notification feed. |

### Routing table (`api-gateway`)

| Path prefix | Routes to |
|---|---|
| `/api/auth/**`, `/api/branding/**` | auth-service |
| `/api/applications/**` | application-service |
| `/api/affordability/**` | affordability-service |
| `/api/products/**` | product-service |
| `/api/documents/**` | document-service |
| `/api/notifications/**` | notification-service |

## 4. Data architecture

### 4.1 Database-per-service

Each service owns its schema outright; nothing is shared or joined across service boundaries.
Cross-service reads happen over HTTP via the `RestTemplate` clients named above, never via a
shared connection or foreign key.

### 4.2 JSON-blob-per-section (`application-service`)

`LoanApplication` is one row per application, with **one nullable `TEXT` column per wizard step**
holding that step's data as a raw JSON blob (e.g. `personalDetailsJson`, `incomeEmploymentJson`,
`businessFinancialsJson`). A single generic endpoint, `PUT /api/applications/{appRef}/section`
(body: `{ section, data }`), serializes whatever map it's given into the matching column.

This is the load-bearing architectural decision in the whole system: every wizard-shape change to
date (consent step insertion, address history, multiple employments, joint bank connections, the
entire business-loan journey, guarantor flow, business financials intelligence) shipped as a
**pure additive frontend change** — add a new column, add a new section key to the ordered list
below, done. No migrations of existing data, no controller/DTO churn.

Two parallel ordered section lists drive the wizard, selected by `applicationType`
(`PERSONAL`/`BUSINESS`):

- `ALL_SECTIONS` (`ApplicationService`, personal)
- `BUSINESS_SECTIONS` (business)

These lists feed three things: `nextSection()` (what the wizard advances to after a save),
`calculateCompletion()` (the % shown in sidebar/dashboard), and `isSectionFilled()` (the
skip-forward mechanic described in §6.1).

### 4.3 Joint-applicant convention

Any section supporting a second applicant keeps applicant 1's fields flat at the top level and
nests applicant 2 under an `applicant2` key. Every read-only summary view (review-submit,
view-application, underwriter case-detail) only ever reads the flat top-level fields — so adding
joint-applicant support to a new section never requires touching those views.

## 5. Security architecture

- **No passwords anywhere.** Every role (customer, business owner, the 5-tier underwriter
  hierarchy, admin, banker) authenticates with **National ID + a 6-digit OTP**. There is no
  password field on the `User` entity. The one exception: a Banker-created customer account
  (`register-by-staff`) is pre-verified with no OTP step at all — the Banker has already confirmed
  identity by phone/in branch — but the customer still logs in via the normal National ID + OTP
  flow afterward.
- **JWT**: HS256, 24h expiry, subject = a generated `uuid` — never the customer's National ID or
  email, so neither credential is embedded in the token itself.
- **OTP delivery is demo-only**: no SMS/email provider is integrated; the code is echoed back in
  the API response (`demoOtp`) and shown on-screen with a "Demo Environment" banner. This is the
  single clearest "swap before production" seam in the system.
- **Route guards** (frontend): `authGuard` (`/portal/*`), `businessGuard` (`/business/*`),
  `underwriterGuard` (`/underwriter/*`, admits all 5 underwriter-hierarchy roles), `adminGuard`
  (`/admin/*`), `bankerGuard` (`/banker/*`), `assistGuard` (`/banker/case/:appRef/apply/*` —
  additionally requires `EntitlementsService.canActAsCustomer`, currently true only for `BANKER`).
  **Mandate limits are enforced client-side only** (`MandateRules.limitFor(role)`
  exists server-side but is advisory) — not a security boundary as implemented, flagged
  deliberately rather than silently assumed safe.
- **Banker-only endpoints** (`auth-service`, enforced server-side via `hasRole("BANKER")`):
  `POST /api/auth/register-by-staff` (creates a pre-verified customer account) and
  `GET /api/auth/customer-profile/{id}` (looks up a customer's own profile for wizard prefill —
  see §6.6). Both are genuine server-side role checks, not client-side-only like mandate limits.
- **Server-side validation**: Jakarta Bean Validation (`@Valid`) + a `GlobalExceptionHandler`
  (auth-service); business-rule violations throw `IllegalArgumentException`, caught at the
  controller and returned as a structured `ApiResponse.error(...)`.

## 6. Cross-cutting architectural patterns

These are reusable mechanics, not one-off feature code — recognize them before reaching for a new
approach to a similar problem.

### 6.1 Skip-forward wizard sections

`ApplicationService.isSectionFilled(app, section)` decides, per section, whether the wizard can
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

| Feature | Service | Persisted to |
|---|---|---|
| Data Verification (RAG discrepancy checks) | `DataVerificationService` | `dataVerificationJson` |
| Business Financials Intelligence (P&L/Cashflow/Ratios/Risk Grade) | `BusinessFinancialsAnalysisService` | `businessFinancialsAnalysisJson` |
| Synthetic credit score default | `CreditDeclarationsComponent`/`BusinessCreditDeclarationsComponent` (frontend) | `creditDeclarationsJson`/`businessCreditDeclarationsJson` |
| Open Banking connection summary | `connect-bank`/`business-connect-bank` components (frontend) | `bankConnectionJson`/`businessBankConnectionJson` |
| Pre-approved customer accounts/balances | `DashboardComponent.buildRelationshipAccounts()` (frontend) | not persisted — recomputed per render from a seeded PRNG |
| National ID registry lookup tick | `personal-details.component.ts` (`watchIdVerification()`) | not persisted — UI-only simulation |

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
- **`ApplicationService`**: thin HTTP wrapper over every application-service endpoint, plus
  `getResumeRoute(app)` — one shared function (used by both the dashboard and the sidebar
  application switcher) mapping an application's status to where a click on it should go.
- **`AuthService`**: JWT/session in `localStorage`, exposes `userId`/`userEmail`/`role` etc. as
  getters off a `currentUser` signal.

## 8. Local development

```powershell
# Backend — one window per service, all via mvnd
.\start-backend.ps1

# Frontend
cd frontend
ng serve
```

Requires: JDK 21+, Maven Daemon (`mvnd`), Node.js, a running local MySQL instance (schemas are
created automatically on first run via `createDatabaseIfNotExist=true` — no manual DB setup).
Default per-service DB credentials are `root`/`root` (see each service's `application.yml`) — fine
for a local demo, not how this would be run anywhere else.

Seeded accounts (auth-service `DataSeeder`), pre-verified — log in with National ID, then the
on-screen OTP: `admin@digibank.com` (National ID `000000015`), `underwriter@digibank.com`
(National ID `000000014`).

## 9. Known architectural gaps (not bugs — deliberate scope cuts)

- **Mandate limits are not a security boundary** — enforced client-side only (§5).
- **No per-role underwriting queue** — all 5 approver roles (`UNDERWRITER` → `CEO`) share one
  pipeline/case-detail shell; `referToSeniorUnderwriter()` sets a generic status with no
  "referred to which specific role" chain-of-custody field.
- **`AffordabilityRules`/`MandateRules` are in-memory, reset on service restart** — explicitly a
  placeholder for a future persisted/external rules engine, not yet a problem at demo scale.
- **No real third-party integrations** anywhere — OTP delivery, Open Banking, national ID registry
  lookup, and document OCR/extraction are all simulated (§6.3). Each is called out in code
  comments as a clear "swap here" seam.
