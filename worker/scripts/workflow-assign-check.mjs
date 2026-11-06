#!/usr/bin/env node
// End-to-end check of case ownership, routing and SLA clocks against a running worker:
//   node scripts/workflow-assign-check.mjs --base http://127.0.0.1:8794
// Needs the parity customers (workflow-parity.mjs setup) and the seeded staff accounts
// (underwriter 14, admin 15, banker 27, senior underwriter 205). It publishes workflow versions
// into that worker's database, so point it at a scratch one.

const args = process.argv.slice(2);
const BASE = args[args.indexOf("--base") + 1];
let passed = 0, failed = 0;
const check = (name, ok, extra = "") => { (ok ? passed++ : failed++); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   " + extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(token, method, path, body) {
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", Connection: "close", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      break;
    } catch (e) { if (attempt >= 4) throw e; await sleep(300 * attempt); }
  }
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
async function login(nid) {
  const o = await http(null, "POST", "/api/auth/login/request-otp", { nationalId: nid });
  const v = await http(null, "POST", "/api/auth/login/verify-otp", { nationalId: nid, otp: o.body.data.demoOtp });
  return v.body.data.token;
}

const admin = await login("000000015");
const uw = await login("000000014");        // UNDERWRITER, user 1
const sr = await login("000000205");        // SENIOR_UNDERWRITER, user 8, holds case.assign
const banker = await login("000000027");    // BANKER
const customers = {};
for (const n of [340, 339, 338, 337, 336, 335, 334, 333, 332]) customers[n] = await login(`000000${n}`);
const idOf = async (email) => (await http(admin, "GET", "/api/auth/admin/users?type=customers")).body.find((u) => u.email === email).id;
let nextCustomer = 340;
const newCase = async () => {
  const n = nextCustomer--; const token = customers[n]; const email = `parity${n - 300}@example.com`;
  const ref = (await http(token, "POST", "/api/applications/start", { customerId: await idOf(email), customerEmail: email })).body.applicationRef;
  return { ref, token };
};
const toReview = async ({ ref, token }) => {
  await http(token, "POST", `/api/applications/${ref}/submit`);
  await http(token, "POST", `/api/applications/${ref}/select-product`, { productId: "P", productName: "P", interestRate: 5, termMonths: 36, monthlyRepayment: 900 });
  return ref;
};
const state = async (token, ref) => (await http(token, "GET", `/api/workflow/cases/${ref}/state`)).body;

// publish a version with the given REVIEW-stage routing and SLA: all configuration, no code
async function publishReview({ routing, hours, amber }) {
  const draft = (await http(admin, "POST", "/api/auth/admin/workflow/definitions/loan-origination/draft", {})).body;
  const def = (await http(admin, "GET", `/api/auth/admin/workflow/definitions/${draft.id}`)).body.definition;
  const review = def.stages.find((s) => s.key === "REVIEW");
  review.owner = { roles: ["UNDERWRITER", "SENIOR_UNDERWRITER"], unitRule: "ANY" };
  review.sla = { hours, amberAtPercent: amber };
  review.routing = { mode: routing };
  const saved = await http(admin, "PUT", `/api/auth/admin/workflow/definitions/${draft.id}`, { definition: def });
  const pub = await http(admin, "POST", `/api/auth/admin/workflow/definitions/${draft.id}/publish`);
  return { saved: saved.status, pub: pub.status, body: pub.body };
}

// ---- configure round-robin routing with a one-hour SLA
const p1 = await publishReview({ routing: "ROUND_ROBIN", hours: 1, amber: 50 });
check("routing and SLA publish as configuration", p1.saved === 200 && p1.pub === 200, JSON.stringify(p1));
check("an unknown routing mode is rejected", await (async () => {
  const d = (await http(admin, "POST", "/api/auth/admin/workflow/definitions/loan-origination/draft", {})).body;
  const def = (await http(admin, "GET", `/api/auth/admin/workflow/definitions/${d.id}`)).body.definition;
  def.stages[1].routing = { mode: "RANDOM" };
  const r = await http(admin, "PUT", `/api/auth/admin/workflow/definitions/${d.id}`, { definition: def });
  await http(admin, "DELETE", `/api/auth/admin/workflow/definitions/${d.id}`);
  return r.status === 400;
})());

// ---- round-robin: user 1, then 8, then 1 again
const A = await newCase(), B = await newCase(), C = await newCase();
await toReview(A); await toReview(B); await toReview(C);
const [sa, sb, sc] = [await state(uw, A.ref), await state(uw, B.ref), await state(uw, C.ref)];
check("a case entering the review stage is routed to someone", sa.assigneeUserId != null && sa.stage === "REVIEW", JSON.stringify(sa));
check("round-robin gives the next case to the other person", sb.assigneeUserId != null && sb.assigneeUserId !== sa.assigneeUserId, `${sa.assigneeUserId} then ${sb.assigneeUserId}`);
check("and then comes back round", sc.assigneeUserId === sa.assigneeUserId, `${sa.assigneeUserId}, ${sb.assigneeUserId}, ${sc.assigneeUserId}`);
check("the state carries the SLA clock from the definition", sa.sla.state === "GREEN" && sa.sla.hours === 1 && !!sa.sla.dueAt, JSON.stringify(sa.sla));

// ---- availability
check("staff can mark themselves unavailable", (await http(uw, "PUT", "/api/workflow/availability", { available: false })).body.available === false);
check("a customer cannot use staff availability", (await http(customers[336], "PUT", "/api/workflow/availability", { available: false })).status === 403);
const D = await newCase(); await toReview(D);
const sd = await state(sr, D.ref);
check("an unavailable person is skipped by routing", sd.assigneeUserId === 8, JSON.stringify(sd));

// ---- nobody available -> unassigned, then claim / release / assign
await http(sr, "PUT", "/api/workflow/availability", { available: false });
const E = await newCase(); await toReview(E);
check("with nobody available the case stays unassigned", (await state(sr, E.ref)).assigneeUserId == null);
await http(uw, "PUT", "/api/workflow/availability", { available: true });
await http(sr, "PUT", "/api/workflow/availability", { available: true });

check("an eligible underwriter can claim an unowned case", (await http(uw, "POST", `/api/workflow/cases/${E.ref}/claim`)).body.assigneeUserId === 1);
check("claiming your own case again is harmless", (await http(uw, "POST", `/api/workflow/cases/${E.ref}/claim`)).status === 200);
const steal = await http(sr, "POST", `/api/workflow/cases/${E.ref}/claim`);
check("claiming a case someone else owns is a 409", steal.status === 409, `status ${steal.status}`);
const bankerClaim = (await http(banker, "POST", `/api/workflow/cases/${E.ref}/claim`)).status;
check("a banker (not an owning role, and outside the case's scope) cannot claim", bankerClaim === 403 || bankerClaim === 404, `status ${bankerClaim}`);
check("a customer cannot claim", (await http(customers[340], "POST", `/api/workflow/cases/${E.ref}/claim`)).status === 403);
check("assigning needs the case.assign entitlement", (await http(uw, "POST", `/api/workflow/cases/${E.ref}/assign`, { userId: 8 })).status === 403);
const elig = await http(sr, "GET", `/api/workflow/cases/${E.ref}/eligible`);
check("eligible staff lists the owning roles with load", elig.status === 200 && elig.body.some((e) => e.userId === 1) && elig.body.some((e) => e.userId === 8) && !elig.body.some((e) => e.role === "BANKER"), JSON.stringify(elig.body));
check("a reassign to an ineligible person is refused", (await http(sr, "POST", `/api/workflow/cases/${E.ref}/assign`, { userId: 3 })).status === 400);
const moved = await http(sr, "POST", `/api/workflow/cases/${E.ref}/assign`, { userId: 8 });
check("a manager can reassign to an eligible colleague", moved.status === 200 && moved.body.assigneeUserId === 8, JSON.stringify(moved.body));
check("someone without case.assign cannot release another's case", (await http(uw, "POST", `/api/workflow/cases/${E.ref}/release`)).status === 403);
const rel = await http(sr, "POST", `/api/workflow/cases/${E.ref}/release`);
check("the owner can release their case", rel.status === 200 && rel.body.assigneeUserId == null);

// ---- queues
const ownerOfA = sa.assigneeUserId === 1 ? uw : sr; // round-robin start depends on earlier runs' history
const mine = await http(ownerOfA, "GET", "/api/applications/pipeline?owner=me");
const refsMine = mine.body.map((r) => r.applicationRef);
check("pipeline ?owner=me lists only my cases", mine.status === 200 && refsMine.includes(A.ref) && refsMine.includes(C.ref) && !refsMine.includes(B.ref), JSON.stringify(refsMine));
const free = await http(uw, "GET", "/api/applications/pipeline?owner=unassigned");
check("pipeline ?owner=unassigned lists the unowned", free.body.some((r) => r.applicationRef === E.ref) && !free.body.some((r) => r.applicationRef === A.ref));
check("queue rows carry stage, owner and SLA", mine.body[0]?.workflow?.stage === "REVIEW" && mine.body[0]?.workflow?.assigneeName && mine.body[0]?.workflow?.sla?.state, JSON.stringify(mine.body[0]?.workflow));

// ---- moving stage clears the owner; closed cases cannot be assigned
const declined = await http(ownerOfA, "POST", `/api/applications/${A.ref}/decline`, { reason: "test" });
const sA2 = await state(uw, A.ref);
check("a case that changes stage loses its owner", declined.status === 200 && sA2.stage === "CLOSED" && sA2.assigneeUserId == null, JSON.stringify(sA2));
check("a closed case has no SLA clock", sA2.sla.state === "NONE");
check("a closed case cannot be assigned", (await http(sr, "POST", `/api/workflow/cases/${A.ref}/assign`, { userId: 1 })).status === 409);

// ---- visibility of state
check("the customer can read their own case's state", (await http(A.token, "GET", `/api/workflow/cases/${A.ref}/state`)).status === 200);
check("another customer gets a 404", (await http(customers[339], "GET", `/api/workflow/cases/${A.ref}/state`)).status === 404);

// ---- least-loaded routing is configuration too
const p2 = await publishReview({ routing: "LEAST_LOADED", hours: 0.0003, amber: 50 });
check("switching to least-loaded publishes", p2.pub === 200, JSON.stringify(p2));
// user 8 currently owns D; user 1 owns C (A was closed). Make user 8's load higher with the next case.
const F = await newCase(); await toReview(F);
const sF = await state(sr, F.ref);
check("least-loaded picks someone", sF.assigneeUserId != null, JSON.stringify(sF));

// ---- SLA turns red, and the unit summary counts it
await sleep(2500);
const sF2 = await state(sr, F.ref);
check("a case past its SLA is red", sF2.sla.state === "RED", JSON.stringify(sF2.sla));
const sum = await http(admin, "GET", "/api/workflow/sla-summary");
const totalRed = sum.body.units.reduce((n, u) => n + (u.parentId == null ? u.total.red : 0), 0) + sum.body.noUnit.red;
check("the SLA summary counts breaches", sum.status === 200 && totalRed >= 1, JSON.stringify(sum.body).slice(0, 300));
check("a customer cannot read the SLA summary", (await http(customers[339], "GET", "/api/workflow/sla-summary")).status === 403);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
