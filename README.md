# DigiBank Personal Loans (DigiLend)

Digital loan origination for banks in Israel: personal and business loan journeys for customers, underwriters,
bankers and administrators, in English and Hebrew. One deployment serves several lenders (banks) with their data
kept apart.

The **Worker** (`worker/`, Cloudflare Workers + D1 + R2) is the build that runs today and is the reference
implementation. The **Java services** (`backend/`) are the production target and get parity later. The Angular
app (`frontend/`) is served by the Worker.

## Where things are

| Folder | What |
|---|---|
| `frontend/` | Angular app: customer, business, banker, underwriter, admin and platform portals |
| `worker/` | Cloudflare Worker API, D1 migrations and seeds, check scripts (`worker/scripts/`) |
| `backend/` | Java Spring Boot services (production target, not deployed) |
| `workflow-spec/` | Language-neutral case-workflow contract, default definition, shared test vectors |
| `letter-spec/` | Language-neutral letter format and rules, shared test vectors |
| `loadtest/` | JMeter load test of the customer journey |
| `design-exploration/` | The "Signal Gold" visual direction, with its static prototype (not the shipped design) |

## Run it locally

```bash
cd worker   && npx wrangler dev      # API on :8787 (local D1; first time: apply migrations and seeds, see ARCHITECTURE.md section 8)
cd frontend && npx ng serve          # app on :4200, /api is proxied to the Worker
cd worker   && npx vitest run        # Worker tests
```

Demo mode shows the login code on screen, so any seeded user can sign in with just a National ID.

## Environments and branches

`dev` deploys to the private Dev environment (`npm run deploy:dev2` in `worker/`); `master` is the UAT / demo
environment and only changes when the owner says to promote. Details, the promotion checklist and the state of the
next UAT release (on hold): [`BRANCHING.md`](./BRANCHING.md).

## Documents

| Read this | For |
|---|---|
| [`PROJECT_DOCUMENTATION.md`](./PROJECT_DOCUMENTATION.md) | What the system does, feature by feature, per journey; hosting and environments; design decisions |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Structure: services, data, security, patterns (masters, letters, workflow, multi-tenancy), local development |
| [`MULTI_TENANCY_DESIGN.md`](./MULTI_TENANCY_DESIGN.md) | How lenders are kept apart, phase by phase, with the decisions behind it |
| [`PENDING_WORK.md`](./PENDING_WORK.md) | **The one backlog**: decisions needed, open work, and the meaning of every ID (S2, G4, Y5, ...) cited in code comments |
| [`BRANCHING.md`](./BRANCHING.md) | Branches, environments, promotion to UAT, migration rules |
| [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md) | Handover of `frontend/` and `backend/` to the customer: what infrastructure they must provide, vulnerability audit, Worker parity |
| [`workflow-spec/README.md`](./workflow-spec/README.md) | The workflow engine contract (with `CORRECTIONS.md`: deliberate behaviour changes) |
| [`letter-spec/README.md`](./letter-spec/README.md) | The letter engine contract |
| [`backend/workflow-service/README.md`](./backend/workflow-service/README.md) | The Java workflow service |
| [`loadtest/README.md`](./loadtest/README.md) | Running the load test |
| [`frontend/README.md`](./frontend/README.md) | Frontend conventions and commands |
| [`design-exploration/README.md`](./design-exploration/README.md) | The design exploration and what keeps it alive |

## Working agreements

- **Spec first, then both engines.** Anything the Java services must also do (workflow, letters) has a language-neutral
  spec with shared vectors; the Worker is built and verified first.
- **Migrations are additive** (nullable or defaulted columns; renames and drops wait a release): every lender shares them.
- **Every query on a tenant table goes through `inLender(...)`**; a test fails the build otherwise.
- **Nothing is done until it is runtime-verified**, not only compiled.
