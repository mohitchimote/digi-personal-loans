# DigiBank Personal Loans — Project Documentation

A full-stack demo of an end-to-end digital personal loan origination journey for DigiBank (Israel), built for a prospect demo. Covers customer registration, a 10-step loan application wizard, automated affordability/eligibility decisioning, underwriter review, and approval/disbursement — plus underwriter and admin back-office portals.

---

## 1. Functional Overview

### 1.1 Customer journey (end to end)

1. **Landing page** → **Register** (full name, email, phone, National ID, ID issue date — no password).
2. **OTP verification** — a 6-digit code gates account activation. No SMS/email provider is integrated yet, so in this demo the code is returned in the API response and shown on screen with a "Demo Environment" banner. 5-minute expiry, 5 max attempts before requiring a resend.
3. **Intro page** — explains the journey and required documents, then into the **Portal**.
4. **9-step application wizard** (`/portal/apply/...`), each step persisted independently and resumable:

   | # | Step | Key data captured |
   |---|------|---|
   | 1 | Loan Requirements | Amount, purpose, term, number of applicants (1 = single, 2 = joint) |
   | 2 | Personal Details | Identity (name, DOB, national ID + issue date — prefilled from registration for applicant 1, with a simulated national-ID-database verification tick), contact (phone/email, prefilled from registration for applicant 1), address + address history (must total ≥36 months across current + previous addresses, for credit-check purposes), and applicant 2 details for joint applications. **Branch Assistance**: a "being assisted by staff?" toggle reveals an optional 9-digit **staff member National ID** field (`staffNationalId`) alongside the existing **preferred branch** dropdown — captured for future call/request routing, not wired up yet. **Consent** (credit bureau, PEP, sanctions, data processing) is captured here too, as a modal — triggered by **Save & Next** once the whole form is valid (not mid-typing); confirming it shows the recorded validity date and fires a customer notification. There's an orphaned standalone `/apply/consent-management` route/component left over from an earlier iteration, no longer linked from anywhere — consent now lives entirely in this step |
   | 3 | Connect Bank | Simulated Open Banking connection (per applicant, independently, for joint applications) — generates a fake account summary (masked account, average balance, transaction count) |
   | 4 | Income & Employment | Employment status/employer/income; supports declaring **multiple employments** per applicant via "+ Add Another Employment" — total income is kept in sync at the top level for downstream affordability calculation |
   | 5 | Outgoings | Rent/mortgage, existing loans, credit cards, living expenses |
   | 6 | Credit Declarations | Self-declared credit history (defaults, bankruptcy, CCJs, payment plans, credit score) |
   | 7 | Verify ID | Document upload (national ID) |
   | 8 | Direct Debit | Repayment account details — prepopulated from a connected bank account if available; for joint applications, the customer picks which applicant's connected account to use, or enters details manually |
   | 9 | Review & Submit | Full summary + final declaration checkboxes (terms, privacy, credit search consent) + signature |

5. **Submission** triggers an automated **affordability assessment** (DTI/HTI ratios, credit score, repayment capacity) against admin-configurable rules.
6. If affordability passes, the customer sees **eligible products** (filtered by credit score, income, requested amount, DTI, risk category) and selects one.
7. **Auto-approval**: if the requested amount is under an admin-configurable threshold (different for single vs. joint applications) and affordability passed, the application is **automatically approved** — otherwise it's routed to an underwriter queue.
8. **Approval page**: shows the decision, lets the customer generate/download a conditional approval letter, then (once supporting documents are uploaded) a final approval letter + loan agreement.
9. Customers can hold multiple applications over time (e.g. a past approved one and a new draft); the **dashboard** lists all of them, and the **sidebar application switcher** lets the customer jump between any of them from anywhere in the portal without returning to the dashboard.

### 1.1.0 Dashboard: "Your Relationship with DigiBank" (collapsible)

A collapsible card on the customer dashboard (collapsed by default — "My Applications" stays the visual focus, expanded by default) shows what the customer holds with the bank, combining two very different data sources under one `BankRelationshipAccount` shape (`type: 'CURRENT' | 'DEPOSIT' | 'LOAN'`):

- **Current Account (עו"ש) / Term Deposit (פיקדון)** — entirely **synthetic**, shown only when the customer has a `PreApprovedOffer` on file (our existing signal that the bank already has a relationship with them — see §1.1.1). No core-banking integration exists, so `DashboardComponent.buildRelationshipAccounts()` deterministically derives masked account numbers, branch, balance, and (for deposits, ~60% of personas) rate/maturity from a tiny seeded PRNG keyed on the customer's National ID — same persona always sees the same accounts, different personas see different ones, nothing hardcoded per name.
- **Loan Account** — entirely **real**, shown automatically for any application where `disbursementStatus === 'FUNDS_RELEASED'`, regardless of pre-approved status (a normal full-journey customer like David Cohen gets one too). Built from genuinely already-known data: `approvedAmount` (falling back to the originally requested `loanRequirementsJson.loanAmount` if somehow null), the selected product's rate/term/monthly repayment, and the `DECISION_APPROVED` underwriting note's timestamp as the approval date (falls back to `updatedAt`). The **Outstanding Balance** is a genuine declining-balance amortization computed from elapsed months since approval — it actually decreases as real time passes across demo sessions, not a random number.
- Each Loan Account card has four actions: **Statements** (fully implemented — see below), **Loan Variation** (שינוי תנאי הלוואה), **Make a Prepayment** (פירעון מוקדם), **Close the Loan** (סילוק הלוואה) — the latter three are placeholders that show a "coming soon" banner (`DashboardComponent.comingSoon()`), ready to wire up later.
- **Statements**: clicking it opens a modal showing a real month-by-month breakdown (payment date, principal/interest split, running balance) recomputed from the loan's actual disbursement date/rate/repayment — `DashboardComponent.buildStatementRows()`. Same amortization math as the balance figure on the card, so the two are always consistent.

### 1.1.1 Pre-approved existing-customer fast-track

For a customer the bank has already pre-approved (represented by a `PreApprovedOffer` record keyed on National ID — see §2.6), the dashboard shows a "You're Pre-Approved!" card with an **Apply Now** button (deliberately not "Accept & Continue" — it's still a loan being applied for, even if the bank already knows most of the answer). Clicking it creates an application pre-filled with synthetic data for every section *except* **Personal Details** (identity + the consent gate) and **Connect Bank** (confirm/change the repayment account), which the customer still passes through explicitly; the wizard then jumps straight to **Review & Submit**, skipping the pre-filled middle steps. See §2.4 for the `nextSection()` mechanics that make this possible without a separate code path for the normal journey.

### 1.2 Underwriter journey

- **Pipeline** (`/underwriter/pipeline`): queue of applications in `SUBMITTED`, `UNDER_REVIEW`, `CONDITIONALLY_APPROVED`, `REFERRED_TO_SENIOR`, `APPROVED`.
- **Case detail** (`/underwriter/case/:appRef`): tabbed view (Overview, Identity, Affordability, Credit & Risk, **Data Verification**, Decision) with the ability to edit any section, leave notes (general note / clarification request / document request — the latter two notify the customer), approve, decline, refer to a senior underwriter, send back for more information, and (post-approval) authorise fund release or submit for a second check.

#### 1.2.1 Data Verification tab — RAG discrepancy checks (demo capability)

Showcases a capability that isn't really integrated yet: cross-checking the customer's self-declared **Application Data** against simulated **Document Data** (payslips/national ID — no OCR exists, files are never read) and simulated **3rd-Party Data** (credit bureau/national registry — no integration exists). Since live demos use whatever name/income the client gives and generic stock-photo/blank documents, the comparison is **synthetic but deterministic per application**, not tied to fixed personas:

- **Generation** (`DataVerificationService.getOrGenerate`, application-service): on first view, seeds `Random` from `applicationRef.hashCode()` and rolls a status per rule (<60% GREEN, 60–84% AMBER, ≥85% RED) across ~10 rules spanning Full Name/DOB/National ID/Address (`personalDetails`), Monthly Income/Employer (`incomeEmployment`), and Credit Score/Default/Bankruptcy/CCJ flags (`creditDeclarations`). The synthetic value is generated to *match* the rolled status (never compared after the fact), so the displayed value can never contradict its own color. Result is persisted into a new nullable `dataVerificationJson` column on `LoanApplication` — **generated once, never regenerated**, so it's stable across reloads and survives the underwriter editing other sections later.
- **Resolution**: each non-green rule can be resolved with one of four actions — **Send Back**, **Approve as Exception** (requires a note), **Call Staff** (uses the applicant's `staffNationalId`/`preferredBranch` from Personal Details, see §1.1's Branch Assistance fields — disabled with a hint if neither is on file), **Call Customer** (uses their phone number). Resolving a rule does **not** change its RAG color (it stays a permanent visual record) — the dot instead turns **light green** (`.dv-resolved`, distinct from a true GREEN row) to show "was flagged, now handled" without losing the original finding.
- **Soft gate on Decision**: if any RED rule is unresolved, the Decision tab requires an "Approval Exception Notes" textarea before the **Approve** button is enabled (logged into Decision History via the existing notes infra on submit). Decline/Send Back/Refer to Senior are never gated by this.
- **Endpoints**: `GET /api/applications/{appRef}/data-verification` (generate-if-absent), `POST /api/applications/{appRef}/data-verification/resolve` (body: `ruleKey`, `action`, `note`, `reviewedBy`).

### 1.3 Admin journey

- **Users**, **FAQs**, **Branding** (logo/colors — fully theme-aware, no hardcoded brand colors), **Rules** (affordability thresholds, editable at runtime).

---

## 2. Technical Architecture

### 2.1 High-level shape

```
Angular SPA (frontend, :4200)
        │  all calls go through
        ▼
API Gateway — Spring Cloud Gateway (:8080)
        │  path-based routing, CORS handling
        ▼
┌─────────────┬──────────────────┬─────────────────────┬──────────────┬───────────────┬────────────────────┐
│ auth-service│application-svc   │affordability-service │product-svc   │document-svc    │notification-svc    │
│   :8081     │    :8082         │      :8083           │   :8084      │    :8085       │     :8086          │
│ digibank_auth│ digibank_app    │  (stateless,         │digibank_     │digibank_docs   │digibank_           │
│             │                 │   no DB —             │product       │                │notifications       │
│             │                 │   rules in memory)    │              │                │                    │
└─────────────┴──────────────────┴─────────────────────┴──────────────┴───────────────┴────────────────────┘
```

All backend services are **Java 21 / Spring Boot 3.2.5**, built and run via **mvnd** (Maven Daemon — faster incremental builds than plain Maven), each as an independent microservice with its own MySQL schema (created automatically via Hibernate `ddl-auto: update` — no Flyway/Liquibase migrations in this demo). `start-backend.ps1` launches all 7 services, each in its own PowerShell window running `mvnd spring-boot:run`.

The frontend is Angular 22 (standalone components, signals-based reactive state, no NgModules), served via `ng serve` in development.

### 2.2 API Gateway routing (`backend/api-gateway`)

Pure path-based proxy — no business logic. Routes by URL prefix to the matching service:

| Path prefix | Routes to |
|---|---|
| `/api/auth/**`, `/api/branding/**` | auth-service (:8081) |
| `/api/applications/**` | application-service (:8082) |
| `/api/affordability/**` | affordability-service (:8083) |
| `/api/products/**` | product-service (:8084) |
| `/api/documents/**` | document-service (:8085) |
| `/api/notifications/**` | notification-service (:8086) |

CORS is configured here for `localhost:4200` and the LAN IP used for demo access from other devices.

### 2.3 auth-service

- **Entity**: `User` (id, uuid [generated, used as the JWT subject], email, nationalId [unique], idIssueDate, fullName, phoneNumber, role [`CUSTOMER`/`UNDERWRITER`/`ADMIN`], enabled, emailVerified, otpCode/otpExpiresAt/otpAttempts, createdAt, lastLogin). **No password field** — there is no password-based authentication anywhere in this app, for any role.
- **Registration flow**: `POST /api/auth/register` takes full name, email, phone, National ID, and ID issue date (no password); creates the user `enabled=false`, generates and stores a 6-digit OTP, returns it in the response (`demoOtp` field — explicitly demo-only, no SMS/email provider wired up). `POST /api/auth/register/verify-otp` validates the code against the user's **email** (5-min expiry, 5 max attempts) and on success flips `enabled`/`emailVerified` true and issues a JWT. `POST /api/auth/register/resend-otp` regenerates the code. The submitted National ID/issue date are later used to prepopulate the Personal Details wizard step.
- **Login**: two-step, National ID + OTP, for every role (customer, underwriter, admin) — there is no email/password login. `POST /api/auth/login/request-otp` (body: `{ nationalId }`) looks the user up by National ID, generates a 6-digit OTP (again echoed in the response as `demoOtp` for this demo), and is shown on screen. `POST /api/auth/login/verify-otp` (body: `{ nationalId, otp }`) validates it and issues a JWT. `OtpService.verifyOtp(user, otp)` is shared between the registration and login flows; only the registration path additionally flips `emailVerified`/`enabled`.
- **JWT**: HS256, 24h expiry, subject = the user's `uuid` (not email or National ID, so neither is exposed in the token). `JwtAuthenticationFilter` validates on every request; `SecurityConfig` keeps `/register`, `/register/verify-otp`, `/register/resend-otp`, `/login/request-otp`, `/login/verify-otp`, `/faqs`, and `GET /branding*` public, everything else requires a valid token (`/admin/**` requires `ROLE_ADMIN`).
- **Branding**: admin-managed logo + theme colors, served publicly so the unauthenticated landing/login pages can brand themselves.
- **FAQs**: seeded on startup (categories: Loan Eligibility, Application Process, Interest Rates & Repayments, Credit & Affordability, Security & Privacy).

### 2.4 application-service — the core of the wizard

- **Entity**: `LoanApplication` — one row per application. `applicationRef` (e.g. `DGB-2026-12345`), `customerId`/`customerEmail`, `status` (`DRAFT` → `IN_PROGRESS` → `SUBMITTED` → `UNDER_REVIEW` → `CONDITIONALLY_APPROVED`/`REFERRED_TO_SENIOR` → `APPROVED`/`DECLINED`/`WITHDRAWN`), `currentSection`, `completionPercentage`, and **one `TEXT` column per wizard step holding that step's data as a raw JSON blob** (`loanRequirementsJson`, `consentManagementJson`, `personalDetailsJson`, `bankConnectionJson`, `incomeEmploymentJson`, `outgoingsJson`, `creditDeclarationsJson`, `verifyIdJson`, `directDebitJson`, `reviewSubmitJson`), plus `selectedProductJson`, `affordabilityResultJson`, `dataVerificationJson` (see §1.2.1), `approvedAmount`, `disbursementStatus`.
- **Why JSON blobs per section, not normalized tables**: every step's shape can evolve independently without a migration — the generic `PUT /api/applications/{appRef}/section` endpoint (`{ section, data }`) just serializes whatever map it's given into the matching column. This is what let every increment in this project (consent management, address history, multiple employments, joint bank connections, etc.) ship as a pure additive frontend change with zero backend schema churn beyond adding one new `TEXT` column.
- **Joint-applicant convention**: every section that supports a second applicant keeps applicant 1's fields flat at the top level and nests applicant 2 under an `applicant2` key (e.g. `personalDetailsJson: { firstName, ..., applicant2: { firstName, ... } }`). This is consistent across `personalDetailsJson`, `incomeEmploymentJson`, `creditDeclarationsJson`, and `bankConnectionJson` — and is the reason read-only views (review-submit, view-application, underwriter case-detail) didn't need any changes when applicant-2 support was added to a section: they only ever read the flat top-level fields for "the" applicant.
- **`ALL_SECTIONS`** ordered list drives `nextSection()` (what the wizard advances to after a save) and `calculateCompletion()` (the % shown in the sidebar/dashboard).
- **Auto-approval**: `selectProduct()` → `maybeAutoApprove()` checks the affordability result passed, computes whether it's a joint application (from `personalDetailsJson.applicant2`), and compares the requested loan amount against `AffordabilityRules.autoApprovalThresholdSingle`/`Joint` (fetched from affordability-service) — if under threshold, calls `approveApplicationByUnderwriter("System (Auto-Approval)", ...)` automatically.
- **Notifications**: declines, send-backs, approvals, and clarification/document requests all trigger a customer-facing notification via `NotificationClient` (calls notification-service).
- **Documents**: final approval automatically triggers `DocumentClient.generateFinalApprovalLetter(...)` (calls document-service); failures here are swallowed (a PDF generation hiccup must never block an underwriting decision).

### 2.5 affordability-service (stateless)

- `POST /api/affordability/check`: given income, outgoings, requested loan amount/term, and credit info, computes:
  - **DTI** (debt-to-income) and **HTI** (housing-to-income) ratios.
  - Hard stops: active bankruptcy, previous default.
  - Soft stops: net income below minimum, DTI/HTI over max, credit score below minimum, calculated repayment exceeding repayment capacity (40% of disposable income by default).
  - Standard loan amortisation formula for the calculated monthly repayment.
  - Risk category (`LOW`/`MEDIUM`/`HIGH`) and credit score category (`EXCELLENT`/`GOOD`/`FAIR`/`POOR`).
- `GET`/`PUT /api/affordability/rules`: admin-editable thresholds (`AffordabilityRules` — max DTI/HTI, min income, base rate, repayment capacity factor, min credit score, auto-approval thresholds). **In-memory only — resets to defaults on service restart** (documented as a placeholder for a future external rules engine).

### 2.6 product-service

- Seeds 3 products on first run: Standard Personal Loan (5.50% APR, ₪10k–150k), Premium Personal Loan (4.80% APR, ₪50k–300k, higher eligibility bar), Express Loan (6.20% APR, ₪5k–50k, fast-track).
- `POST /api/products/eligible`: filters products by credit score, income, requested amount range, DTI, and risk category; the cheapest eligible product is marked "recommended" / "Best Rate".
- `POST /api/products/select`: records the customer's chosen product + computed repayment schedule.

### 2.7 document-service

- Generates PDFs (conditional approval letter, final approval letter, loan agreement, repayment schedule) and stores them; also handles customer-uploaded supporting documents (national ID, payslips, bank statements, proof of address) with view/download endpoints for both generated and uploaded files.

### 2.8 notification-service

- In-app notification feed per customer (title, message, type, optional application reference), unread count, mark-as-read/mark-all-read, and a "seed welcome notification" call fired right after a new customer completes OTP verification.

### 2.9 Frontend (Angular)

- **Standalone components throughout**, signals for local state, `TranslatePipe` + `I18nService` for English/Hebrew i18n (RTL-aware), reactive forms for every step.
- **Routing** (`app.routes.ts`): `portal/*` guarded by `authGuard`, `underwriter/*` by `underwriterGuard`, `admin/*` by `adminGuard`. Several pages support an optional `:appRef` route param to target a *specific* application rather than always defaulting to "the customer's most recently updated application" — see §2.10.
- **`ApplicationService`**: thin HTTP wrapper around every application-service endpoint, plus `getResumeRoute(app)` — a single shared function (used by the dashboard and the sidebar switcher) that maps an application's status to the right place to send the customer: wizard step (draft/in-progress), `/portal/approval/:appRef` (approved/conditionally approved), or `/portal/view-application/:appRef` (everything else).
- **`AuthService`**: JWT/session storage in `localStorage`, exposes `userId`/`userEmail`/`userFullName`/`userPhone`/`role` as simple getters off a `currentUser` signal.
- **Sidebar**: shows the active application's progress + step checklist (only clickable when that application is actually editable — draft/in-progress; otherwise a read-only checklist + "view full application" link), and an application switcher (chevron dropdown) listing all the customer's applications.

### 2.10 The "appRef-aware vs. current-application" pattern

A structural detail worth understanding before touching customer-facing pages: most application data is fetched via `ApplicationService.getCurrent(customerId)`, which returns **the customer's most recently updated application** — fine for the in-flow wizard (there's only ever one active draft) but wrong for any page meant to show a *specific* application when a customer has more than one (e.g. one approved, one still in progress).

The established, additive fix pattern: the component checks `route.snapshot.paramMap.get('appRef')` (or, for `PortalComponent`, walks the route tree since the param lives on a child route) and calls `getApplication(appRef)` if present, falling back to `getCurrent(customerId)` exactly as before if not — so nothing that doesn't pass an appRef ever changes behavior. Components/routes that follow this pattern: `PortalComponent` (sidebar context), `ViewApplicationComponent` (route `view-application/:appRef`, appRef-aware from the start), `ApprovalComponent` (route `approval/:appRef` added alongside the original param-less `approval`, which is still used by the product-selection flow for the current application). `affordability-results.component.ts` and `products.component.ts` have **not** been audited for this — they're only reached via the natural in-wizard flow today, so likely fine, but haven't been explicitly verified.

---

## 3. Cross-cutting concerns

- **i18n**: every user-facing string goes through `'key.path' | translate` (or `I18nService.t()` in TypeScript), with parallel `en.ts`/`he.ts` dictionaries supporting `{{param}}` interpolation. Hebrew is RTL. Bilingual labels are handled entirely by having distinct EN/HE dictionary entries per key (e.g. `dashboard.viewStatements` → "Statements" in `en.ts`, "דפי חשבון" in `he.ts`) — never by hardcoding the other language's text inside one dictionary's string.
- **Typography**: Inter, self-hosted via the `@fontsource/inter` npm package (weights 400/500/600/700 added to `angular.json`'s global `styles` array) — bundled into the build output, no runtime call to Google Fonts/any external CDN. `styles.scss`'s base `font-family` is `'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif`.
- **Theming/branding**: all brand colors are CSS custom properties (no hardcoded hex in component styles), editable by admins; icons are Material Icons (no emoji).
- **Validation**: Angular reactive form validators client-side; `@Valid`/Jakarta Bean Validation + a `GlobalExceptionHandler` (auth-service) server-side. Business-rule violations (duplicate email, application not found, etc.) throw `IllegalArgumentException`, caught at the controller and returned as a structured `ApiResponse.error(...)`.
- **No real third-party integrations**: OTP delivery, Open Banking (Connect Bank), and the national ID database lookup are all simulated client-side/in the demo backend — explicitly called out in code comments and UI copy as demo-only, so they're easy to find and swap for real providers (Resend/SendGrid/Twilio, an Open Banking aggregator, a national ID API) later.

---

## 4. Local development

```powershell
# Backend — one window per service, all via mvnd
.\start-backend.ps1

# Frontend
cd frontend
ng serve
```

Requires: JDK 21+, Maven Daemon (mvnd), Node.js, MySQL running locally (`jdbc:mysql://localhost:3306/<db>?createDatabaseIfNotExist=true`, default `root`/`root` credentials per service's `application.yml` — schemas are created automatically on first run, no manual DB setup beyond having a MySQL server up).

Seeded accounts (auth-service `DataSeeder`), pre-verified/enabled — log in with National ID, then the on-screen OTP: `underwriter@digibank.com` (National ID `000000014`), `admin@digibank.com` (National ID `000000015`).

---

## 5. Notable design decisions (and why)

- **JSON-blob-per-section over normalized tables**: chosen specifically so the wizard's shape could keep evolving (consent step insertion, address history, multiple employments, joint bank connections) without database migrations — every increment in this project's history added at most one nullable `TEXT` column.
- **Flat-applicant-1 + nested-`applicant2`** convention: keeps every read-only summary view (review, underwriter case detail, customer view-application) working unchanged whenever a section gains joint-applicant support, since they only ever read the unnested top-level fields.
- **Demo-mode OTP echoed in the API response**: a placeholder until a real SMS/email provider is integrated — clearly labeled in both code comments and the UI ("Demo Environment" banner) so it's never mistaken for production behavior.
- **National ID + OTP login instead of email/password, for every role**: matches how Israeli banking customers actually expect to authenticate (Teudat Zehut, not a password they have to remember), and removes password storage/reset entirely from the system. The JWT subject is a generated `uuid` rather than the National ID itself, so the credential customers log in with is never embedded in the token.
- **`getResumeRoute()` centralized in `ApplicationService`**: originally duplicated in `dashboard.component.ts`; hoisted into the service so the dashboard and the sidebar application switcher can't drift out of sync on "where does clicking this application take you."
- **Data Verification's RAG status never changes on resolution**: keeping the original GREEN/AMBER/RED as a permanent record (with a separate light-green "resolved" indicator layered on top) preserves an honest audit trail of what was actually flagged, rather than letting a resolved item visually look like it was never a problem.
- **Loan Account vs. Current Account/Deposit cards use a deliberately different trust model**: the latter two are frankly synthetic (no core-banking integration exists) and clearly scoped to demo personas with a pre-approved offer; the Loan Account card uses only data the system already genuinely knows (approved amount, product terms, approval timestamp) and computes its balance with real amortization math — so it ages correctly across real time instead of looking fake.
