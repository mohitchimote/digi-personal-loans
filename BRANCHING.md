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

## Before sharing UAT externally
`DEMO_MODE=true` shows the login OTP on screen, so anyone with the link can sign in as any ID. Decide whether to keep that.
