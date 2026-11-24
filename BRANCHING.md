# Branching and environments

Two long-lived branches, two environments. Code branches and deployments are separate things.

| Branch   | Holds                                         | Deploys to                                   | Command            |
|----------|-----------------------------------------------|----------------------------------------------|--------------------|
| `dev`    | Latest work (UI, API, DB schema, config frameworks) | **Dev**: `digibank-personal-loans2`, DB `digibank2` (private, owner only) | `npm run deploy:dev2` |
| `master` | UAT / demo code, kept demo-ready              | **UAT / Demo**: `digibank-personal-loans`, DB `digibank` (shareable, e.g. bank gap assessment) | `npm run deploy` (guarded) |

## Rules
- All new work happens on `dev` and is deployed to Dev only.
- `master` changes only when `dev` has advanced significantly and the owner says to promote. No routine pushes.
- Urgent UAT fix: branch from `master`, merge to `master`, then merge `master` back into `dev`.
- The UAT `deploy` and `db:migrate:remote` scripts run `worker/scripts/guard-stable.mjs`: they refuse unless on a clean `master` equal to `origin/master`.
- Tag every UAT release (`stable-YYYY-MM-<name>`). First one: `stable-2026-11-demo` (worker version `9d61ac10`).

## Promoting dev to master (checklist)
1. Take everything up to a migration boundary, not cherry-picked commits: migrations are numbered, so the UAT DB (`digibank`) needs every migration in order.
2. Form definitions and workflows are data in `form_versions`, not code. Include the seed or data migration that updates them, or code and DB will disagree (this caused the `agreedToPrivacy` 400).
3. Apply migrations and seeds to a copy of the UAT DB first, and run the e2e suite against it.
4. Merge `dev` into `master`, run `npm run db:migrate:remote`, then `npm run deploy`.
5. Tag the release and note the Worker version id (for `wrangler rollback`).

## Migration rule (multi-lender)
Migrations are shared by every lender, so they must be additive: new columns nullable or defaulted, no renames or drops until a later release in which nothing uses the old name. See MULTI_TENANCY_DESIGN.md.

## Before sharing UAT externally
`DEMO_MODE=true` shows the login OTP on screen, so anyone with the link can sign in as any ID. Decide whether to keep that.

## Release: multi-tenancy to UAT (UAT is at migration 0015; this brings 0016-0023)
**ON HOLD (owner's decision, 2026-11-24).** This is not a multi-tenancy-only release: `dev` also carries masters, organisation, form-builder, workflow and Letters work (migrations 0016-0020 and the seeds below), and multi-tenancy builds on those tables. The owner does not want that configuration work on UAT yet, so everything waits and ships together. Keep `scripts/uat-keep.proposed.txt` (approved) and re-run the rehearsal against a fresh export of UAT before the real release.
Rehearsed on a local copy of the UAT database (exported read-only from `digibank`) and run end to end on Dev (loans2). Nothing below has been run against UAT.

**Decide first (owner)**
1. The cases to keep: `worker/scripts/uat-keep.proposed.txt` (10 of 139: the latest manual demo cases plus one per status). Edit the list, then regenerate the SQL.
2. Admin 99 (`000000099`) becomes the platform super admin (migration 0023). UAT has **no other admin**, so a DIGI admin must be created right after (step 8). Pick that person's National ID and e-mail.
3. `DEMO_MODE` (unchanged question, see below) and that **everyone signs in again once** (old tokens carry no lender claim).

**Steps (in this order)**
1. Backup: `wrangler d1 export digibank --remote --output uat-before.sql`; note the D1 Time Travel bookmark (`wrangler d1 time-travel info digibank`) if available on the plan. Migrations 0021/0022 rebuild tables and are not reversible by code.
2. Merge `dev` into `master` (owner pushes), tag nothing yet.
3. `npm run db:migrate:remote` (guarded): applies 0016-0023. Existing rows all become lender 1 (DIGI).
4. Purge: `node scripts/uat-purge.mjs --keep <list> > purge.sql`; first run the "stored files" query printed at the top of `purge.sql` to list R2 keys, then `wrangler d1 execute digibank --remote --file purge.sql`; then delete those keys from R2 (`digibank-documents`).
5. Seeds (UAT has no masters or organisation yet): `seed-masters.sql`; reference data in stages for Israel (`node scripts/seed-reference-stage.mjs IL > /tmp/il.sql`); `scripts/seed-org-structure.sql`; `seed-form-versions.sql` (idempotent).
6. `npm run deploy` (guarded; clean `master` equal to `origin/master`). Note the Worker version id.
7. Sign in as admin 99 (lands on the platform console), enter DIGI.
8. Create DIGI's admin (Users, Add staff user, role Admin), sign in as them, and run **apply master sources** on both forms (API: `POST /api/auth/admin/form-builder/forms/<formKey>/apply-master-sources`; there is no button for it yet).
9. Check: a kept customer signs in with their old National ID and opens their case; an underwriter's pipeline lists the kept cases; documents of kept cases still download.
10. Tag `stable-2026-11-multitenancy`; record the Worker version id. Rollback = `wrangler rollback` for code plus a restore from step 1 for data.

**Write budget** (D1 free plan: 100k row writes per day across the account, shared by UAT and Dev; once it is used up every write fails, including the login code, with a 500 "daily row write limit" until midnight UTC). Tests that clone a lender on a remote database are expensive: each clone copies about 5,900 master items and their indexes, so six clones on loans2 on 2026-11-24 used the day's budget and took UAT's login down too. Run clone-heavy checks locally.

**Release budget:** migrations and backfill, the purge (about 1,700 deletes), masters (about 5,900 rows) and Israel's reference data fit in one day. Other countries' cities are loaded on later days.

**Rehearsal result** (copy of UAT, new code, local): 139 cases and 89 users backfilled to DIGI; admin 99 became super admin; purge 139 to 10 cases and 90 to 14 users with no orphaned rows; after seeds and apply-master-sources, a kept customer signed in without a code, their old case opened with its form definition, the pipeline, workflow state, actions, notes and document records all worked (20 checks).
