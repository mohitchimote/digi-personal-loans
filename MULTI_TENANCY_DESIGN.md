# Multi-tenancy (lenders): design

Status: agreed decisions, schema not started. Built on `dev` and deployed to loans2 only; reaches UAT as one promotion (see BRANCHING.md).

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

## Phases
1. Schema: `lenders`, `lender_settings`, `lender_id` columns, backfill to lender 1 (`DIGI`), per-lender uniques. Rehearsed on a copy of the UAT DB.
2. Identity: JWT claims, login with lender code and account picker, `SUPER_ADMIN`.
3. Isolation: scoping helper, convert all queries, caches and R2 keys, static check, cross-lender tests.
4. Lender admin: existing admin screens scoped to the lender, nothing new.
5. Super admin console: lenders list, create, suspend, clone, enter as.
6. Enter as users inside a lender (lender admin).
7. Test: e2e across two lenders on loans2; UAT purge and promotion as one release.

## Open points
- Whether to hide the "which lenders is this ID registered at" picker behind the OTP step before real production use.
- Which UAT cases to keep when purging (proposal: the handful from the latest demo runs plus one in each status).
