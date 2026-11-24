# Multi-tenancy (lenders): design

Status: phases 1 (schema, migration 0021), 2 (identity) and 3 (query isolation, migration 0022) done on `dev`; phase 4 (lender admin) built, not yet committed; phase 5 next. Built on `dev` and deployed to loans2 only; reaches UAT as one promotion (see BRANCHING.md).

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

## Phases
1. Schema: `lenders`, `lender_settings`, `lender_id` columns, backfill to lender 1 (`DIGI`), per-lender uniques. Rehearsed on a copy of the UAT DB.
2. Identity: JWT claims, login with lender code and account picker, `SUPER_ADMIN`.
3. Isolation: scoping helper, convert all queries, caches and R2 keys, static check, cross-lender tests. **Done.**
4. Lender admin: existing admin screens scoped to the lender, nothing new. **Done (frontend side; see above).**
5. Super admin console: lenders list, create, suspend, clone, enter as.
6. Enter as users inside a lender (lender admin).
7. Test: e2e across two lenders on loans2; UAT purge and promotion as one release.

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
