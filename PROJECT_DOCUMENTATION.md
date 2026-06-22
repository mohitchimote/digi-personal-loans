# DigiBank Personal Loans — Project Documentation

A full-stack demo of end-to-end digital loan origination journeys for DigiBank (Israel), built for a prospect demo. Covers **two parallel journeys** — personal loans and business loans — customer/business registration, multi-step application wizards, automated affordability/eligibility decisioning, underwriter review with a 5-tier approval mandate hierarchy, and approval/disbursement — plus underwriter and admin back-office portals.

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
   | 6 | Credit Declarations | Self-declared credit history (defaults, bankruptcy, CCJs, payment plans) — **no credit score input**, see §1.1.2 |
   | 7 | Verify ID | Document upload (national ID) |
   | 8 | Direct Debit | Repayment account details — prepopulated from a connected bank account if available; for joint applications, the customer picks which applicant's connected account to use, or enters details manually |
   | 9 | Review & Submit | Full summary + final declaration checkboxes (terms, privacy, credit search consent) + signature |

   A 10th step, **Guarantor Details**, can appear right after step 2 — but only once an underwriter has specifically requested one; see §1.1.2.

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

### 1.1.2 Credit score (underwriter-only) and Guarantor (underwriter-requested only)

**Credit score** is no longer shown to or collected from the customer anywhere in the journey (it was previously a self-declared 1–9 slider on Credit Declarations, for both personal and business). The automated affordability assessment still needs a number, so a synthetic-but-stable score is generated client-side at submit time — seeded by the applicant's National ID (`syntheticScore()` in `CreditDeclarationsComponent`/`BusinessCreditDeclarationsComponent`, same seeded-hash "fake it" pattern used elsewhere in this project, e.g. §1.2.1) — and stored in the same `creditDeclarationsJson`/`businessCreditDeclarationsJson` field the underwriter already reads on the Credit & Risk tab. If a score already exists on the application (re-editing a draft), the existing value is reused rather than regenerated, so it's stable across saves.

**Guarantor Details** is its own wizard step, but it's **skipped by default** for every application — guarantor information is never asked in the first pass. It only becomes a real (non-skippable) stop once an underwriter, on the Decision tab, ticks **"Require a guarantor from the customer"** when sending the case back. That action (a) sets `guarantorRequired = true` on the application, (b) routes the customer's next visit straight to the Guarantor Details step with every other section still pre-filled and editable, (c) requires the customer to upload a guarantor supporting document (`GUARANTOR_ID`) before continuing, and (d) the customer resubmits afterward. The underwriter's Identity tab (personal) / Company tab (business) shows a Guarantor card once required — filled details, or a "pending customer" notice if not yet provided. Implementation reuses the wizard's existing skip-forward mechanic (`isSectionFilled()`/`nextSection()` in `ApplicationService`, see §2.4) rather than a new conditional-routing system — `guarantorDetails` is just another entry in `ALL_SECTIONS`/`BUSINESS_SECTIONS` that's always "filled" (skippable) unless `guarantorRequired` is true and `guarantorDetailsJson` is still null.

### 1.2 Underwriter journey

- **Pipeline** (`/underwriter/pipeline`): queue of applications in `SUBMITTED`, `UNDER_REVIEW`, `CONDITIONALLY_APPROVED`, `REFERRED_TO_SENIOR`, `APPROVED`. Table columns: reference, applicant, **Loan Amount**, **Purpose**, **Term** (all three sourced from `loanRequirementsJson` — `PipelineComponent.loanAmount()`/`loanPurpose()`/`loanTerm()`), status, submitted date, and a Review action.
- **Global application search** (underwriter header only): a search box in `UwShellComponent`'s top nav, active from 3+ characters, matches against application reference, applicant full name, National ID, and customer email across the same pipeline list the Pipeline page uses. Results are a typeahead dropdown; selecting one navigates straight to that case's detail page. Pipeline data is refetched on every focus (not polled) to stay reasonably fresh. **Admin does not get this** — `/underwriter/case/:appRef` is gated by `underwriterGuard`, which blocks the `ADMIN` role, so a search box there couldn't open anything anyway. (Implementation note: the search query is a signal, not a plain `ngModel`-bound property — `computed()` only re-runs when a *signal* it reads changes, so binding the query as a plain string made results look frozen/stale until the pipeline cache happened to refresh. Bind via `[ngModel]="query()"` + `(ngModelChange)="query.set($event)"` if extending this pattern elsewhere.)
- **Case detail** (`/underwriter/case/:appRef`): tabbed view (Overview, Identity, Affordability, Credit & Risk, **Data Verification**, Decision) with the ability to edit any section, leave notes (general note / clarification request / document request — the latter two notify the customer), approve, decline, refer to a senior underwriter, send back for more information (optionally requiring a guarantor — see §1.1.2), and (post-approval) authorise fund release or submit for a second check.

#### 1.2.2 Approval Mandates

A 5-tier approval hierarchy — **Underwriter → Senior Underwriter → Head of Lending → COO → CEO** — each with an admin-configurable maximum approval amount (`/admin/mandates`, same admin-editable/in-memory/resets-on-restart pattern as Affordability Rules, see §2.5). The Decision tab shows the logged-in approver's own mandate limit; if the requested/approved amount exceeds it, **Approve is disabled outright** and the underwriter must use **Refer to Senior** instead — there is no override.

**Pragmatic scope decision**: rather than building four new role-specific shells/pipelines, all five roles (`UNDERWRITER`, `SENIOR_UNDERWRITER`, `HEAD_OF_LENDING`, `COO`, `CEO`) share the exact same Underwriter shell, pipeline, and case-detail UI — distinguished only by a role label under their name in the header and by which mandate limit applies on the Decision tab. **Known gap, not an oversight**: there's no per-role pipeline filtering or "referred to which specific role" chain-of-custody field yet — `referToSeniorUnderwriter()` just sets status `REFERRED_TO_SENIOR` generically, visible to every approver role regardless of tier. Flagged here as a fast-follow if a real multi-tier queue is needed later.

#### 1.2.1 Data Verification tab — RAG discrepancy checks (demo capability)

Showcases a capability that isn't really integrated yet: cross-checking the customer's self-declared **Application Data** against simulated **Document Data** (payslips/national ID — no OCR exists, files are never read) and simulated **3rd-Party Data** (credit bureau/national registry — no integration exists). Since live demos use whatever name/income the client gives and generic stock-photo/blank documents, the comparison is **synthetic but deterministic per application**, not tied to fixed personas:

- **Generation** (`DataVerificationService.getOrGenerate`, application-service): on first view, seeds `Random` from `applicationRef.hashCode()` and rolls a status per rule (<60% GREEN, 60–84% AMBER, ≥85% RED) across ~10 rules spanning Full Name/DOB/National ID/Address (`personalDetails`), Monthly Income/Employer (`incomeEmployment`), and Credit Score/Default/Bankruptcy/CCJ flags (`creditDeclarations`). The synthetic value is generated to *match* the rolled status (never compared after the fact), so the displayed value can never contradict its own color. Result is persisted into a new nullable `dataVerificationJson` column on `LoanApplication` — **generated once, never regenerated**, so it's stable across reloads and survives the underwriter editing other sections later.
- **Resolution**: each non-green rule can be resolved with one of four actions — **Send Back**, **Approve as Exception** (requires a note), **Call Staff** (uses the applicant's `staffNationalId`/`preferredBranch` from Personal Details, see §1.1's Branch Assistance fields — disabled with a hint if neither is on file), **Call Customer** (uses their phone number). Resolving a rule does **not** change its RAG color (it stays a permanent visual record) — the dot instead turns **light green** (`.dv-resolved`, distinct from a true GREEN row) to show "was flagged, now handled" without losing the original finding.
- **Soft gate on Decision**: if any RED rule is unresolved, the Decision tab requires an "Approval Exception Notes" textarea before the **Approve** button is enabled (logged into Decision History via the existing notes infra on submit). Decline/Send Back/Refer to Senior are never gated by this.
- **Endpoints**: `GET /api/applications/{appRef}/data-verification` (generate-if-absent), `POST /api/applications/{appRef}/data-verification/resolve` (body: `ruleKey`, `action`, `note`, `reviewedBy`).

### 1.3 Admin journey

- **Users** (role assignment, including all 5 underwriter-hierarchy roles plus `BUSINESS_OWNER`), **FAQs**, **Branding** (logo/colors — fully theme-aware, no hardcoded brand colors), **Rules** (affordability thresholds, editable at runtime), **Mandates** (per-role approval limits, see §1.2.2), **Products** (full CRUD over every personal and business loan product — code, name, description, rate, amount/term range, min credit score, min income, max DTI, eligible risk categories, active flag — with a Personal/Business filter; `AdminProductsComponent`, mirrors the existing FAQs admin page's list+form pattern. Backend: `GET/POST/PUT/DELETE /api/products/admin*` in `ProductController`, enforcing unique `productCode` on create/update).

### 1.4 Business Loan journey

A second, fully parallel end-to-end journey for companies — same overall shape as the personal journey (register → wizard → submit → automated assessment → eligible products → underwriter review → decision → disbursement) but with business-specific data and math throughout. Built additively on the same backend services and the same `LoanApplication` entity (see §2.4), so the personal journey is completely unaffected.

- **Registration**: the existing `/register` page gained an Individual/Business toggle. Choosing Business reveals 4 extra company fields (legal name, registration number, industry, year founded) above the same personal-identity fields (the authorized signatory's own name/email/phone/National ID/ID issue date — unchanged validators). Submits `accountType: 'BUSINESS'`, which makes `auth-service` assign `role = BUSINESS_OWNER` instead of `CUSTOMER` and persist the company fields on `User`. **Login is unchanged** — same National ID + OTP flow; the role in the JWT response is what routes a signatory to `/business/dashboard` instead of `/portal/dashboard`.
- **Portal shell**: `/business/*`, guarded by `businessGuard` (mirrors `underwriterGuard`'s shape), structurally parallel to `/portal/*` — own shell, own sidebar, own dashboard.
- **9-step wizard** (`/business/apply/...`): Company Details (also doubles as loan requirements — amount/purpose/term, same as personal's combined first step), Signatories (repeatable list: name, National ID, title, ownership %, primary-signatory flag), Connect Business Bank (reuses the same simulated Open Banking summary pattern as personal Connect Bank), Business Financials (annual turnover, monthly revenue, net profit margin, years trading, employee count), Business Outgoings (existing debt service, lease/rent, payroll, supplier payments), Credit Declarations (company-level liquidation/winding-up/CCJ flags + director credit score — also now hidden from the customer, see §1.1.2), Verify ID, Direct Debit (reused as-is — repayment account capture isn't personal-specific), Review & Submit. **Guarantor Details** can appear right after Signatories, under the exact same underwriter-requested-only rule as the personal journey (§1.1.2).
- **Affordability**: a parallel `POST /api/affordability/check-business` computes **DSCR** (debt-service coverage ratio = (annual turnover − business outgoings) ÷ annual debt service) instead of DTI/HTI, with hard stops for company liquidation/director default and a soft stop below a DSCR threshold. Thresholds are currently hardcoded constants in `BusinessAffordabilityService` (not yet on the admin Rules page — flagged as a fast-follow, matching how personal affordability thresholds started before that page existed).
- **Products**: `LoanProduct` gained a `productType` discriminator (`PERSONAL`/`BUSINESS`); a few business products (Business Term Loan 7.00% ₪50k-1M, Working Capital Line 8.20% ₪20k-400k, Equipment Finance Loan 6.50% ₪30k-600k) are seeded alongside the personal ones, filtered via the same `/api/products/eligible` endpoint with `productType` now a parameter. Admin-editable via the Products page (§1.3).
- **Demo-visible credit score (2026-06-21, real bureau scales)**: business products require a minimum director credit score, and the synthetic score generated for a business application (§1.1.2) used to be a uniform 1–9 internal value, so roughly half of newly-created business applications saw **zero eligible products** purely because the random score landed below every threshold (the same root cause applied to personal products, just less visibly). Fixed by re-introducing an **editable demo-only credit score slider** on both `CreditDeclarationsComponent` (personal, plus applicant 2) and `BusinessCreditDeclarationsComponent` (business) — but now on realistic bureau scales rather than the internal 1-9 grade: personal uses a **FICO-style 300-850** scale, business uses a **Dun & Bradstreet-style Commercial Delinquency Score, 1-100** (higher = lower risk). The pre-existing internal 1-9 "lender risk grade" that all eligibility/affordability threshold logic (`ProductService.isEligible`, `AffordabilityService`/`BusinessAffordabilityService`) was built against is left completely untouched — `frontend/src/app/core/utils/credit-score.util.ts` (`ficoToLenderGrade`/`dnbScoreToLenderGrade`/`dnbScoreToRiskClass`) converts the bureau-style score to that internal grade purely on the frontend, at the point a product-eligibility or affordability-check request is built, so no backend threshold needed rewriting. This internal grade (plus, for business, D&B's own 1-5 Risk Class) is **underwriter-only** — surfaced as a new "Lender Risk Grading (Internal)" card on case-detail's Credit & Risk tab, never sent to or rendered for the customer. Marked demo-only in code comments so the customer-facing slider is easy to strip back out for a hypothetical production build (where it would revert to underwriter-only, non-editable).
- **Business document checklist (2026-06-21, done)**: `CaseDetailComponent.checklist` now branches on `application.applicationType === 'BUSINESS'`, swapping in `BUSINESS_REQUIRED_DOCUMENT_TYPES` (`CERTIFICATE_OF_INCORPORATION`/`FINANCIAL_STATEMENTS`/`BUSINESS_BANK_STATEMENTS`) instead of the personal required-types list, on top of the existing conditional `GUARANTOR_ID` addition.
- **Auto-approval**: business applications **always** route to manual underwriter review — `maybeAutoApprove()` returns early for `applicationType == "BUSINESS"` (auto-approval thresholds are personal-only for now, not because of a hard policy decision but because a business-specific threshold hasn't been defined yet).
- **Underwriter side**: the same pipeline and case-detail UI is reused; case-detail swaps the Identity/Affordability/Credit & Risk tabs for Company/Signatories/Business Financials & Risk equivalents when `application.applicationType === 'BUSINESS'`. Decision, Notes, Disbursement, and Mandates (§1.2.2) are completely unchanged — they already operate generically on `appRef` regardless of applicant type.
- **Explicitly out of scope for this pass** (not blockers to a demoable journey): a Data Verification (RAG) tab for business cases, the dashboard's Statements/Loan Variation/Prepayment/Close-Loan actions for a disbursed business loan, and admin-editable business affordability thresholds.

#### 1.4.1 Business Financials Intelligence panel (2026-06-21, done)

`BusinessAffordabilityService` still computes the single DSCR number used for the pass/fail affordability check, but underwriters now also get a much richer read-only picture on the case-detail Affordability tab — **Financial Ratios, P&L summary, Cashflow Analysis, and a Risk Grade (A-E)** — sourced from whatever business data exists, not extra wizard form fields. Since there's no real OCR/document-extraction integration, this is **faked** exactly the way this project already fakes Open Banking and Data Verification (§1.2.1):

- **Generation** (`BusinessFinancialsAnalysisService.getOrGenerate`, application-service): seeds a `Random` from `applicationRef.hashCode()`, derives a full P&L (annual revenue → COGS/gross profit/opex/EBITDA/net profit via randomized-but-bounded margins) and cashflow statement (operating/investing/financing/net cash flow, closing balance) from `businessFinancialsJson`, plus liquidity/leverage ratios (current ratio, quick ratio, debt-to-equity, net profit margin %). A Risk Grade (A-E) blends the existing DSCR (read from `affordabilityResultJson`, not recomputed), director credit score, current ratio, and debt-to-equity into a single letter. Result is persisted to a new nullable `businessFinancialsAnalysisJson` column — generated once, never regenerated, same stability contract as `dataVerificationJson`.
- **Trigger**: the frontend (`CaseDetailComponent.maybeLoadFinancialsAnalysis`) only requests generation once a qualifying document (`FINANCIAL_STATEMENTS` or `BUSINESS_BANK_STATEMENTS`) has actually been uploaded — matching the "customer attaches documents, system derives the rest" design; the customer-facing journey gained no new required fields.
- **Endpoint**: `GET /api/applications/{appRef}/business-financials-analysis` (generate-if-absent).
- **Known limitation**: figures are internally consistent per-application but not tied to anything in the uploaded document's actual content (no OCR exists) — same caveat as every other "fake it" feature in this project.

### 1.5 Banker journey (assisted applications)

A **Banker** role for customers who call in or walk into a branch but can't (or haven't yet)
self-register and complete the wizard themselves — the Banker fills it in on their behalf, on the
call/in person, while the customer can later log in normally (National ID + OTP) to check progress
or finish it themselves.

- **Assistance Queue** (`/banker/queue`): every application that's `DRAFT`/`IN_PROGRESS` across
  *all* customers (`GET /api/applications/banker-queue`) — not just the Banker's own, since any
  Banker can pick up any in-progress case.
- **Create Application** (`/banker/create`): Personal/Business toggle, then the customer's own
  name/email/phone/National ID/ID issue date (+ company fields for Business). Submits to
  `POST /api/auth/register-by-staff` — creates a **pre-verified** account (no OTP step; the Banker
  has already confirmed identity by phone/in branch) — then immediately starts a DRAFT application
  and lands the Banker on case detail.
- **Case detail** (`/banker/case/:appRef`): application summary, call notes, and a sidebar into
  every wizard section.
- **Assisted editing reuses the real customer wizard components** — clicking a section opens the
  *actual* `LoanRequirementsComponent`, `PersonalDetailsComponent`, etc. (under
  `/banker/case/:appRef/apply/...`), not a separate reimplementation. Every dropdown constraint,
  conditional reveal (e.g. joint-application Applicant 2), and validator behaves identically to the
  customer's own journey — only the template differs: a dense, 3-column label+field data-entry
  layout (no step-wizard chrome, no Tip/Need Help marketing copy) instead of the customer's
  multi-panel view, switched on a single `identity.isAssisting` flag. See ARCHITECTURE.md §6.6 for
  the identity-resolution mechanics behind this.
- **Prefill**: name/phone/National ID/issue date already keyed in at account creation
  automatically prefill Personal Details (Company Details for business) the same way a normal
  customer's own registration data would — fetched via a Banker-only profile lookup
  (`GET /api/auth/customer-profile/{id}`), never the Banker's own identity.
- **Full submission flow**: Review & Submit → Affordability → Product Selection → Approval all
  work end-to-end inside the Banker shell, landing on the same Approval screen a customer would see.
- **Audit trail**: every section save while assisting logs an underwriting note ("Section edited
  by staff member (assisted application)."), visible to underwriters on the case's notes.
- **Known gap**: Review & Submit still renders the customer-toned aside (Tip/Need Help copy) in
  Banker mode — it predates the dense-layout rollout and was left out of that pass since it's a
  summary/decision screen rather than a data-entry form; cosmetic only.

---

## 2. Technical Architecture

Service topology, data ownership, request flow, security model, and cross-cutting architectural
patterns (skip-forward wizard sections, appRef-aware components, the "fake it" simulation pattern,
bureau-vs-internal credit score scales) now live in **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** —
a separate document that changes only when the architecture itself changes, not with every
feature. This document (§1, §3, §5 below) stays the regularly-updated functional/feature record.

---

## 3. Cross-cutting concerns

- **i18n**: every user-facing string goes through `'key.path' | translate` (or `I18nService.t()` in TypeScript), with parallel `en.ts`/`he.ts` dictionaries supporting `{{param}}` interpolation. Hebrew is RTL. Bilingual labels are handled entirely by having distinct EN/HE dictionary entries per key (e.g. `dashboard.viewStatements` → "Statements" in `en.ts`, "דפי חשבון" in `he.ts`) — never by hardcoding the other language's text inside one dictionary's string.
- **Typography**: Inter, self-hosted via the `@fontsource/inter` npm package (weights 400/500/600/700 added to `angular.json`'s global `styles` array) — bundled into the build output, no runtime call to Google Fonts/any external CDN. `styles.scss`'s base `font-family` is `'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif`.
- **Theming/branding**: all brand colors are CSS custom properties (no hardcoded hex in component styles), editable by admins; icons are Material Icons (no emoji).
- **Contrast on dark headers**: any element placed on a dark-blue header/banner needs an explicit light color — text-on-dark contrast bugs in this app have all come from a child relying on `color: inherit`/a shared utility class (e.g. `.db-btn--ghost`, which hardcodes `var(--body-text)`, a dark color) while the header container itself never actually set `color: #fff`. Fixed so far in the Login/Register/Intro headers' language switcher and the Admin/Underwriter shells' Sign Out button (`.uw-header .db-btn--ghost` override) — if a similar component gets dropped onto a new dark background, check this first rather than assuming inheritance "just works."
- **Validation**: Angular reactive form validators client-side; `@Valid`/Jakarta Bean Validation + a `GlobalExceptionHandler` (auth-service) server-side. Business-rule violations (duplicate email, application not found, etc.) throw `IllegalArgumentException`, caught at the controller and returned as a structured `ApiResponse.error(...)`.
- **No real third-party integrations**: OTP delivery, Open Banking (Connect Bank), and the national ID database lookup are all simulated client-side/in the demo backend — explicitly called out in code comments and UI copy as demo-only, so they're easy to find and swap for real providers (Resend/SendGrid/Twilio, an Open Banking aggregator, a national ID API) later.

---

## 4. Local development

See **[`ARCHITECTURE.md` §8](./ARCHITECTURE.md#8-local-development)** for how to bring up the
stack and seeded login credentials.

**Known startup gotcha**: starting all 7 services simultaneously via `start-backend.ps1` can
occasionally cause one service to fail its DB connection during the initial thundering-herd of
Hikari pool startups against MySQL — it'll just sit idle in its window rather than retrying. If a
service isn't responding after the others are up, restart that one service's window individually
(`cd backend/<service>; mvnd spring-boot:run`) rather than re-running the whole script.

---

## 5. Notable design decisions (and why)

- **JSON-blob-per-section over normalized tables**: chosen specifically so the wizard's shape could keep evolving (consent step insertion, address history, multiple employments, joint bank connections) without database migrations — every increment in this project's history added at most one nullable `TEXT` column.
- **Flat-applicant-1 + nested-`applicant2`** convention: keeps every read-only summary view (review, underwriter case detail, customer view-application) working unchanged whenever a section gains joint-applicant support, since they only ever read the unnested top-level fields.
- **Demo-mode OTP echoed in the API response**: a placeholder until a real SMS/email provider is integrated — clearly labeled in both code comments and the UI ("Demo Environment" banner) so it's never mistaken for production behavior.
- **National ID + OTP login instead of email/password, for every role**: matches how Israeli banking customers actually expect to authenticate (Teudat Zehut, not a password they have to remember), and removes password storage/reset entirely from the system. The JWT subject is a generated `uuid` rather than the National ID itself, so the credential customers log in with is never embedded in the token.
- **`getResumeRoute()` centralized in `ApplicationService`**: originally duplicated in `dashboard.component.ts`; hoisted into the service so the dashboard and the sidebar application switcher can't drift out of sync on "where does clicking this application take you."
- **Data Verification's RAG status never changes on resolution**: keeping the original GREEN/AMBER/RED as a permanent record (with a separate light-green "resolved" indicator layered on top) preserves an honest audit trail of what was actually flagged, rather than letting a resolved item visually look like it was never a problem.
- **Loan Account vs. Current Account/Deposit cards use a deliberately different trust model**: the latter two are frankly synthetic (no core-banking integration exists) and clearly scoped to demo personas with a pre-approved offer; the Loan Account card uses only data the system already genuinely knows (approved amount, product terms, approval timestamp) and computes its balance with real amortization math — so it ages correctly across real time instead of looking fake.
- **Guarantor reuses the skip-forward mechanic instead of a new conditional-routing system**: `isSectionFilled()`/`nextSection()` already existed to make sections skippable (originally built for the pre-approved fast-track, §1.1.1); making `guarantorDetails` "filled by default unless flagged" needed no new infrastructure, just one more entry in the existing ordered section lists.
- **Approval Mandates share one shell across all 5 roles rather than 5 separate UIs**: building distinct dashboards/pipelines per role would have been roughly as large as the entire business-loan journey on its own, for a demo where the only behavioral difference between roles is "what's my approval ceiling." Explicitly flagged as a scope cut, not an oversight — see §1.2.2 for the specific gap this leaves (no per-role queue filtering).
- **Business loans always go to manual underwriter review, no auto-approval path**: not a deliberate risk policy so much as a placeholder — auto-approval thresholds only exist for personal loans today, and rather than guessing at a business threshold, business applications are routed to a human every time until that's defined.
