# Multi-tenancy (lenders): design

Status: phases 1 (schema, migration 0021), 2 (identity) and 3 (query isolation, migration 0022) done on `dev`; phases 4 to 6 built; phase 7: tests on Dev (loans2) done and the UAT release rehearsed and written up (BRANCHING.md, "Release: multi-tenancy to UAT"); the UAT purge and promotion wait for the owner's go. Built on `dev` and deployed to loans2 only; reaches UAT as one promotion (see BRANCHING.md).

## Decisions
1. A **customer belongs to one lender**. The same national ID may register at two lenders as two separate accounts.
2. **Login** takes national ID plus an optional lender code. If the ID exists at several lenders and no code is given, the user picks which account to enter. (Showing which lenders an ID is registered at is acceptable for the demo; revisit before real production use.)
3. **Enter as**: a super admin can enter any lender; a lender admin can enter any user in their own lender, to see the screens as that user. Always audit-logged and visibly flagged in the UI.
4. **Existing UAT data becomes lender `DIGI`**, after purging e2e test cases down to single digits (done on a copy first, exact rows reviewed before any purge on the live UAT DB).
5. **Lender row stays minimal.** Everything descriptive (address, countries and regions served, currencies, locale, time zone, sending e-mail address) lives in per-lender settings, edited on the same admin screens.

## Model
- `lenders(id, code UNIQUE, name, status ACTIVE|SUSPENDED, created_at)`.
- `lender_settings(lender_id, key, value_json)`, primary key `(lender_id, key)`. Keys such as `profile.address`, `geo.countries`, `finance.currencies`, `locale.defaults`, `mail.from`.
- Shared database, `lender_id` on every tenant table (a database per lender is out: Worker bindings are fixed at deploy time, so onboarding would need a redeploy).
- `users.lender_id` is NULL only for super admins. New role `SUPER_ADMIN` (locked, every entitlement plus `lenders.manage`). Admin 99 (national ID `000000099`) is the first one. The existing `ADMIN` role becomes lender-scoped.

## Tables
Tenant config (get `lender_id`, uniques become per lender): `roles`, `role_entitlements`, `mandates`, `org_levels`, `org_units`, `wf_definitions`, `form_versions`, `master_types`, `master_items`, `letter_templates`, `letter_versions`, `letter_saved_rules`, `letter_images`, `email_templates`, `branding_settings`, `faqs`, `loan_products`, `pre_approved_offers`, `affordability_rules`, `mandate_rules`.

Tenant transactional (get `lender_id`, denormalised so scoping never needs a join): `users`, `loan_applications`, `wf_cases`, `wf_case_tracks`, `case_referrals`, `underwriting_notes`, `generated_documents`, `uploaded_documents`, `notifications`, `product_selections`, `letters_issued`, `audit_log`.

Unique changes (SQLite needs table rebuilds):
- `users`: `email`, `national_id`, `company_registration_number` become unique per `(lender_id, ...)`.
- `roles.code`, `master_types.code`, `letter_templates.key`: single-column primary keys become `(lender_id, code)`. Anything referencing them by code gets `lender_id` in the join.
- `org_levels.name`, `org_units.code`, `loan_products.product_code`, `email_templates.event_key`, `branding_settings.id` (one row per lender), `affordability_rules.id`, `mandate_rules.id`: become per lender.
- `loan_applications.application_ref` and `wf_cases.application_ref` stay **globally** unique, so a reference is never ambiguous in a URL.
- R2 keys are prefixed `lender-<id>/`; in-process caches (roles, forms, branding) are keyed by lender.

## Identity and isolation
- JWT gains `lnd` (lender id, absent for super admin) and, while entering as someone, `act` (the real actor's uuid). `requireAuth` still loads the user row and **the row decides**; a token whose `lnd` disagrees with the row is rejected.
- The lender comes from `c.get("authUser").lenderId` only, never from a request header or body.
- One scoping helper adds the `lender_id` filter. There are about 190 `.from(` call sites to move onto it. A test enumerates the tenant tables and fails if any is queried outside the helper.
- Case visibility (`ALL` / `UNIT_TREE` / `UNIT_ONLY`) applies inside the lender, unchanged.
- Cross-lender tests: lender A's admin, underwriter and customer get 403/404 on lender B's cases, forms, users, documents and letters.

## Cloning a lender (super admin)
Copies configuration only: roles and entitlements, mandates, org levels and units, the **published** workflow and form versions (as version 1), masters, letters and images, e-mail templates, branding, products, rules, and lender settings. No customers, cases, documents or notifications. Org-unit parents, letter versions and similar are re-keyed through an old-to-new id map, in one atomic D1 batch. It creates the new lender's first admin.

## Phase 2 as built
- JWT carries `lnd` (the user's lender id, or 0 for a platform token). `requireAuth` loads the user and applies `decideLenderContext`: the row decides, the claim must agree, suspended lenders are refused, and a lender-less row is valid only for `SUPER_ADMIN`. Tokens issued before this release have no `lnd` and are rejected, so everyone signs in again once after deploy.
- `c.get("lenderId")` is the lender of the request (null for a super admin who has not entered one); `requireLender(c)` throws 400 for null.
- `SUPER_ADMIN` is a built-in role (not a row in `roles`): every lender entitlement plus `platform.lenders` and `platform.enterLender`. It satisfies `requireRole("ADMIN")`. Admin 99 is **not** converted yet: that waits for phase 5, so DIGI is never left without an admin before "enter as lender" exists.
- Login: `/login/request-otp` and `/login/verify-otp` take an optional `lenderCode`. One match proceeds; several return `requiresLenderChoice` plus the lender names, and the login page shows a picker. Registration takes an optional `lenderCode` (implied when only one lender is active); e-mail and National ID are unique per lender.
- Role lookups (`resolveRole`, `allRoleConfigs`, `staffRoleCodes`) and the master pick-list helpers now take a lender id, so the compiler lists every call site. Routes that do not yet filter by lender are the phase 3 sweep (for example the roles admin queries, FAQs, branding).

## Phase 3 as built
- `inLender(table, lenderId, ...conditions)` (lib/lender-scope.ts) is the one filter. Every read, update and delete of a tenant table goes through it, and every insert sets `lenderId` explicitly (after any spread of a request body, so a body cannot choose its lender). Lender-less code is limited to `lib/lenders.ts`, `middleware/auth.ts` (login and token lookups) and `lib/otp.ts` (OTP columns of a user row already resolved).
- `test/lender-isolation.test.ts` reads `db/schema.ts` for the tables that have a `lender_id` column and fails if any `.from/.update/.delete/.insert/.join` of one has no `inLender`/`lenderId` in its statement. `scripts/lender-isolation-check.mjs` is the behavioural proof: two lenders on a scratch worker, 60 checks (cross-lender reads, writes, deletes, same codes in both lenders, lender ids in bodies ignored, public routes).
- Library functions take the lender id (`ensureDefaultDefinition`, `getPublishedVersion`, `resolveMandate`, `closeReferrals`, `getAffordabilityRules`, `masterItemNames`, ...), so the compiler listed every caller. Where a case row is in hand the lender comes from it (`app.lenderId`), so the workflow engine, notifications, e-mail and offer pack never use the caller's lender for a different lender's case.
- `recordAudit` requires `lenderId`; the six copies of `actorOf` are one (lib/audit.ts) and add the lender, so every audit row carries it. Before this, audit rows silently took the column default (lender 1).
- A customer or user id taken from a request body (start application, notifications) must belong to the caller's lender (`assertUserInLender`); an application ref in a document, product or letter request must too.
- Caches are keyed by lender: affordability rules, products, role config, loan-purpose names. R2 keys of new files are prefixed `lender-<id>/` (offer pack, uploads, letters, logos). Existing files keep their old keys; the stored path is what is read back. Logo URLs are now `/api/branding/logo/<lenderId>/<file>`; the old `/logo/<file>` still serves the pre-lender folder.
- **Public routes** (branding, FAQs, masters pick-lists on the registration form) have no token. `optionalAuth` uses the signed-in user's lender if there is a valid token; otherwise `publicLender` takes `?lender=CODE`, or the only active lender. With several lenders and no code: pick-lists answer 400 "enter your lender code", branding returns neutral colours, FAQs return an empty list. The frontend still has to send `?lender=` once there is more than one lender (phase 4).
- **Corrections to phase 1 found on the way:**
  - `branding_settings`, `affordability_rules` (and `mandate_rules`) are one row per lender, but code looked up `id = 1`. A second lender's row has a different id, so that lookup would never find it. They now look up by lender, and the affordability save is an upsert.
  - `letter_saved_rules.id` was still a global primary key, so two lenders could not both save a rule called "Rate can change". Migration 0022 makes it `(lender_id, id)`.
  - `seed.sql` inserted staff users with no `lender_id` (the users column has no default), so a freshly seeded database had staff who could not sign in. The seed now sets lender 1.
- Not done here (belongs to later phases): the frontend sending `?lender=`, `SUPER_ADMIN` console, enter-as, cloning, and the UAT purge.

## Phase 4 as built
The admin screens needed no new endpoints: every route behind them was scoped in phase 3, so a lender admin already sees and changes only their lender. What phase 4 adds is the frontend side:
- `core/services/lender-context.ts` remembers a lender code (from `?lender=CODE` in the page link, the last sign-in, or the login page). The auth interceptor adds `?lender=` to the public GETs (branding, FAQs, registration pick-lists) when nobody is signed in. A lender gives its customers `https://<host>/?lender=CODE`.
- Branding is reloaded whenever someone signs in or out, so the page takes on that lender's colours and logo.
- The admin header shows the lender's name, so an admin always knows which lender the screens are scoped to.
Build-checked only; not yet clicked through in a browser with two lenders.

## Phase 5 as built
- **API** (`routes/platform.ts`, `/api/platform`, entitlement `platform.lenders`, held only by `SUPER_ADMIN`): list lenders with user and application counts; create (below); rename; suspend / activate; `POST /lenders/:id/enter` (a new token for the same super admin with `lnd` = that lender, returned in the normal auth-response shape with the lender filled in); `POST /exit` (back to `lnd` 0). Enter, exit, create, rename, suspend and activate are audited in the affected lender's trail. This file and the clone engine are the only code exempt from the lender-isolation test.
- **Create = clone** (`lib/lender-clone.ts`): a new lender is always a copy of another lender's configuration, plus its first admin (ADMIN role, verified, signs in with the demo OTP like anyone). The lender row, ~30 `INSERT ... SELECT` statements and the admin user run in one D1 batch, so a failure leaves nothing. Copied: roles and entitlements, masters, org levels and units, mandates, the published workflow and form versions (as version 1), letters (published versions as version 1, with pictures re-keyed inside the letter documents), saved rules, e-mail templates, branding, products, affordability rules, FAQs, lender settings. Not copied: users, cases, documents, notifications, pre-approved offers, issued letters, audit. Rows that point at other rows are re-keyed through natural keys (org unit code, level name, master item code).
- **Large masters**: a master type with more than 5000 items (cities) is copied without its items, and so are its children; the response lists them so the new lender's reference data can be loaded separately (`seed-reference-stage.mjs`-style). Everything smaller is copied in full.
- **Suspend** needs no new enforcement: `decideLenderContext` already refuses every token of a suspended lender and login skips its accounts. Nothing is deleted.
- **Migration 0023** turns admin 99 (national ID `000000099`) into the first `SUPER_ADMIN` (no lender); a no-op where that user does not exist. DIGI keeps its own lender admins.
- **Frontend**: `/platform` (super admin only): lenders table, new-lender form (copy from, first admin), rename, suspend, enter. A super admin with no lender who opens an admin URL is sent to the console; after login they land there. Inside a lender the admin header shows a yellow "You are inside this lender as a platform administrator" banner with "Back to platform", and the lender badge.
- Verified: `scripts/platform-check.mjs` (32 checks on a scratch worker: platform access, clone contents and re-keying, enter/exit, suspend/activate, rename), a second run with letters, pictures and mandates in the source, and a click-through in a browser (login, console, enter DIGI, banner, back).
- **Lender addresses (added after the first cut of phase 5).** A lender can be reached on its own hostnames, stored as the lender setting `domains` and edited in the console ("Addresses"). Why: banks want customers to use a link that looks like theirs (`loans.theirbank.com`), and it removes the need to type a lender code.
  - Resolution on public routes: signed-in user's lender, else the lender that owns the request host, else `?lender=CODE`, else the only active lender. On a lender's own address login and registration are forced to that lender whatever code the client sends, and platform accounts are not found there, so the account picker (and its disclosure of which lenders an ID is registered at) never appears on such an address.
  - `GET /api/auth/context` tells the frontend `{ lender, hostMapped, choiceNeeded }`. The login and registration pages show the lender code field only when `choiceNeeded` (a shared address with several lenders, e.g. the platform host or workers.dev). The `?lender=` link and the remembered code remain as the fallback until the production routing is decided.
  - A host belongs to one lender (rejected otherwise); a clone does not inherit its source's addresses; the lookup is cached for 60 seconds and cleared when addresses are saved.
  - Cloudflare side (not done by the app): each address needs DNS and a certificate, e.g. a Custom Domain on the Worker or a wildcard route for sub-domains of our own domain. Adding one needs no redeploy. `wrangler dev` rewrites the host to the production route's hostname, so local tests use a config without `[[routes]]`.
  - Verified: 47 checks in `scripts/platform-check.mjs` (15 of them host cases) and a browser check of the login page on a lender address versus a shared one.
- **Sign-in hardening (follow-up to the addresses).**
  - *Own address only:* once a lender has an address of its own, its accounts and registrations work only there. Knowing its lender code on a shared address (or on another lender's address) gets nothing. A lender without its own address still works by code on shared addresses, which is what UAT and loans2 do today. This answers the "ex-employee who knows the old lender's code" case for lenders that have their own address; for all lenders, the lender admin disabling the account remains the control that matters.
  - *No account enumeration at login:* `login/request-otp` answers a known ID, an unknown ID, a disabled account and an account that may not sign in at this address identically (a success-shaped answer whose code never works), and `login/verify-otp` fails every case (no account, disabled, ambiguous, never requested, expired, locked, wrong code) with one message and status 401. The lender picker still appears for an ID with accounts at several lenders reachable from the address, but lists only those; lenders with their own address never appear in it, so in production (own addresses) it effectively goes away.
  - Not changed: the registration messages ("an account with this e-mail / National ID already exists", "no registration found") still reveal existence within a lender; the login code is still returned to the page (demo mode, no SMS/e-mail channel yet); there is no rate limit beyond the 5-attempt counter per issued code; response timing differs slightly between real and decoy accounts.
  - Verified: 60 checks in `scripts/platform-check.mjs` (28 of them hosts and sign-in) and 400 unit tests.
- Not in this phase: enter *as a user* inside a lender (phase 6), a UI to load large reference data for a new lender, editing `lender_settings`.

## Phase 6 as built
- **What**: a lender admin (or a platform admin who has entered the lender) can view the system as one of the lender's users: Users screen, "View as". The session is a normal token for that user plus an `act` claim naming the administrator (`jwt.ts`); `requireAuth` still loads the user row, and also loads the administrator and re-checks everything on every request (`lib/impersonation.ts`, `mayViewAs`).
- **Rules**: the administrator must be enabled, with sessions not revoked, an `ADMIN` of the user's lender, or a `SUPER_ADMIN` inside it. The user must be in that lender (otherwise "not found"), enabled, not the administrator, and not an administrator. No nesting. Disabling or signing out the administrator, or disabling the user, ends the view on the next request.
- **Read-only (decision, not in the original design)**: the session can only read (GET/HEAD/OPTIONS); everything else answers 403, except exit and logout. Reason: an administrator who could act as an underwriter could approve loans and bypass the maker-checker separation, and the design asks only to "see the screens as that user". Revisit if support needs to act on someone's behalf; that would need its own entitlement and an audit entry per action. Known gap: a few GET handlers write (for example the data-verification summary is generated and stored on first read), and the underwriter's "available for new cases" toggle fails with 403 in a view.
- **Audit**: `USER_VIEW_AS_STARTED` and `USER_VIEW_AS_ENDED` in the lender's trail, with the administrator as the actor.
- **Endpoints**: `POST /api/auth/admin/users/:id/enter-as`; `POST /api/auth/exit-impersonation` (gives back the administrator's own session, inside the lender for a platform admin). Logging out of a view does not sign the viewed user out.
- **UI**: "View as" on the Users screen (staff and customers; not shown for administrators or disabled users); a red banner on every screen ("You are viewing as X (role) · read-only · signed in as Y", Exit view). Exit returns to the Users screen.
- Verified: 27 checks in `scripts/impersonation-check.mjs` (view works as the user and not as the admin; every write refused; admins, other lenders, nesting, non-admins, disabled users refused; platform admin inside versus outside a lender; exit; logout; disabling the administrator or the user ends the view; audit rows), 408 unit tests, and a browser click-through (users list, view as, banner, exit).

## Phase 7 as done
- **Dev (loans2)**: deployed `dev` (Worker version `45fa68de`), which applied migrations 0021-0023 to `digibank2`. Admin 99 became the super admin; DIGI's admin (`000000015`) was created through the console; two lenders cloned from DIGI (about 5,900 master items each, copied in one batch). Results on the real deployment: `lender-isolation-check.mjs` 60/60 between two cloned lenders, `impersonation-check.mjs` 27/27, `platform-check.mjs` 50 of 51 on the first run (the failure was a test assumption, fixed; the fixed script passes 60/60 locally; the address checks that need another Host header are skipped on a real URL and were verified locally).
- **Test debris left on loans2** (suspended, so it behaves as a single-lender system again): lenders ISOA, ISOB and four more from the platform check, their test customers and data, and one disabled test admin in DIGI. There is no "delete lender" by design.
- **UAT rehearsal** on an export of `digibank`: see BRANCHING.md. Findings: UAT lacks the masters and organisation entirely (needs the seeds), its only admin is admin 99 (so a DIGI admin must be created at release time), and the purge script (`scripts/uat-purge.mjs`, 10 cases kept) leaves no orphaned rows.
- **Not done**: the purge and promotion themselves (owner's go), the Playwright `e2e/` suite across two lenders (it is untracked and was not touched), and loading other countries' reference data for new lenders.

## Phases
1. Schema: `lenders`, `lender_settings`, `lender_id` columns, backfill to lender 1 (`DIGI`), per-lender uniques. Rehearsed on a copy of the UAT DB.
2. Identity: JWT claims, login with lender code and account picker, `SUPER_ADMIN`.
3. Isolation: scoping helper, convert all queries, caches and R2 keys, static check, cross-lender tests. **Done.**
4. Lender admin: existing admin screens scoped to the lender, nothing new. **Done (frontend side; see above).**
5. Super admin console: lenders list, create, suspend, clone, enter as. **Done.**
6. Enter as users inside a lender (lender admin). **Done.**
7. Test: e2e across two lenders on loans2; UAT purge and promotion as one release. **Tests and rehearsal done; the release itself waits for the owner.**

## Keeping lenders independent of each other
One codebase, one schema, one Worker: a shared change reaches every lender at once, so lender differences live in data and configuration.
- **Extra fields**: lender's own form definition plus `customData` JSON. No migration.
- **Tables**: a genuinely new table is added for everyone by an additive migration and stays empty for others. A different *shape* of an existing table means that lender gets its own deployment (own Worker, DB and bucket, same codebase, as loans2 already is).
- **Derived fields and rules**: calculated fields, affordability, mandates and workflows are configuration per lender. Logic configuration cannot express goes in a small code module chosen by a lender setting (for example `logic.affordability = "standard" | "lenderX"`), shipped to all and active only where selected.
- **No lender names in code**: a test fails the build on `if (lender === "X")`-style checks.
- **Feature flags**: `features.*` in `lender_settings`. New behaviour is off for every lender until enabled, starting with a test lender.
- **Additive migrations only**: new columns are nullable or defaulted; renames and drops wait for a later release when nothing uses the old name.
- **Versioned config**: forms and workflows are draft, published, archived; in-flight cases stay pinned. Rollback is republishing the previous version.
- **Canary lender**: the e2e suite runs each shared change against a cloned lender with different config before UAT.

## Open points
- Whether to hide the "which lenders is this ID registered at" picker behind the OTP step before real production use.
- Which UAT cases to keep when purging (proposal: the handful from the latest demo runs plus one in each status).
