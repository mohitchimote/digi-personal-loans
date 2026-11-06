#!/usr/bin/env node
// End-to-end check of the workflow definition lifecycle and runtime API against a running worker:
//   node scripts/workflow-admin-check.mjs --base http://127.0.0.1:8791
// Needs the parity customers (scripts/workflow-parity.mjs setup) and the seeded staff accounts.
// Everything it creates stays in that worker's database, so point it at a scratch one.

const args = process.argv.slice(2);
const BASE = args[args.indexOf("--base") + 1];
let passed = 0, failed = 0;
const check = (name, ok, extra = "") => { (ok ? passed++ : failed++); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   " + extra}`); };

async function http(token, method, path, body) {
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", Connection: "close", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      break;
    } catch (e) { if (attempt >= 4) throw e; await new Promise((r) => setTimeout(r, 300 * attempt)); }
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
const uw = await login("000000014");
const custA = await login("000000336");
const custB = await login("000000337");
const custC = await login("000000338");
const custD = await login("000000339");
const idOf = async (nid, email) => (await http(admin, "GET", "/api/auth/admin/users?type=customers")).body.find((u) => u.email === email).id;
const start = async (token, nid, email) => (await http(token, "POST", "/api/applications/start", { customerId: await idOf(nid, email), customerEmail: email })).body.applicationRef;
const toReview = async (token, ref) => { await http(token, "POST", `/api/applications/${ref}/submit`); await http(token, "POST", `/api/applications/${ref}/select-product`, { productId: "P", productName: "P", interestRate: 5, termMonths: 36, monthlyRepayment: 900 }); };
const A = (ref) => `/api/applications/${ref}`;

// ---- access control
check("underwriter cannot list definitions", (await http(uw, "GET", "/api/auth/admin/workflow/definitions")).status === 403);
check("customer cannot open the builder catalog", (await http(custA, "GET", "/api/auth/admin/workflow/catalog")).status === 403);

// ---- runtime read API
const def = await http(uw, "GET", "/api/workflow/definition");
check("runtime definition lists case statuses with labels", def.status === 200 && def.body.statuses?.case?.APPROVED?.label?.en === "Approved", JSON.stringify(def.body).slice(0, 120));
check("runtime definition lists queues", Array.isArray(def.body.queues) && def.body.queues.some((q) => q.key === "pipeline"));

const list1 = await http(admin, "GET", "/api/auth/admin/workflow/definitions");
check("v1 is seeded and published", list1.body.some((d) => d.version === 1 && d.status === "PUBLISHED"), JSON.stringify(list1.body).slice(0, 160));
const v1 = list1.body.find((d) => d.status === "PUBLISHED");

// ---- a case registered now is pinned to v1
const refOld = await start(custA, "000000336", "parity36@example.com");
await toReview(custA, refOld);

// ---- draft lifecycle
const d1 = await http(admin, "POST", "/api/auth/admin/workflow/definitions/loan-origination/draft", {});
check("creating a draft returns a new version", d1.status === 201 && d1.body.version === v1.version + 1 && d1.body.status === "DRAFT", JSON.stringify(d1.body));
const d1again = await http(admin, "POST", "/api/auth/admin/workflow/definitions/loan-origination/draft", {});
check("a second draft request returns the open draft", d1again.status === 200 && d1again.body.existing === true && d1again.body.id === d1.body.id);
check("unknown workflow key is a 404", (await http(admin, "POST", "/api/auth/admin/workflow/definitions/nope/draft", {})).status === 404);

const draft = (await http(admin, "GET", `/api/auth/admin/workflow/definitions/${d1.body.id}`)).body;
const bad = structuredClone(draft.definition);
bad.tracks[0].transitions.find((t) => t.key === "decline").to = "NOPE";
bad.tracks[0].transitions[0].guards.push({ type: "MAGIC" });
const badSave = await http(admin, "PUT", `/api/auth/admin/workflow/definitions/${d1.body.id}`, { definition: bad });
check("an invalid definition is rejected with the full error list", badSave.status === 400 && Array.isArray(badSave.body.errors) && badSave.body.errors.length > 0, JSON.stringify(badSave.body).slice(0, 160));
const stateless = await http(admin, "POST", "/api/auth/admin/workflow/validate", { definition: bad });
check("stateless validate reports the same problems without saving", stateless.status === 200 && stateless.body.ok === false && stateless.body.errors.length > 0);
const wrongKey = structuredClone(draft.definition); wrongKey.key = "other";
check("a draft cannot change its key", (await http(admin, "PUT", `/api/auth/admin/workflow/definitions/${d1.body.id}`, { definition: wrongKey })).status === 400);

// ---- a real configuration change with no code: decline no longer demands a reason, UNDER_REVIEW renamed
const v2def = structuredClone(draft.definition);
const decline = v2def.tracks[0].transitions.find((t) => t.key === "decline");
decline.guards = decline.guards.filter((g) => g.type !== "REASON_REQUIRED");
v2def.tracks[0].statuses.find((s) => s.key === "UNDER_REVIEW").label.en = "In Review (v2)";
const ok = await http(admin, "PUT", `/api/auth/admin/workflow/definitions/${d1.body.id}`, { definition: v2def, changeNote: "Reasons optional on decline; rename Under Review" });
check("a valid edit saves", ok.status === 200 && ok.body.changeNote?.startsWith("Reasons optional"), JSON.stringify(ok.body));
check("runtime definition is unchanged until publish", (await http(uw, "GET", "/api/workflow/definition")).body.statuses.case.UNDER_REVIEW.label.en === "Under Review");

const pub = await http(admin, "POST", `/api/auth/admin/workflow/definitions/${d1.body.id}/publish`);
check("publish succeeds", pub.status === 200 && pub.body.status === "PUBLISHED" && pub.body.version === v1.version + 1, JSON.stringify(pub.body));
const list2 = (await http(admin, "GET", "/api/auth/admin/workflow/definitions")).body;
check("the previous version is archived", list2.find((d) => d.id === v1.id).status === "ARCHIVED");
check("runtime definition now serves v2", (await http(uw, "GET", "/api/workflow/definition")).body.statuses.case.UNDER_REVIEW.label.en === "In Review (v2)");
check("a published version cannot be edited", (await http(admin, "PUT", `/api/auth/admin/workflow/definitions/${d1.body.id}`, { definition: v2def })).status === 409);

// ---- pinning: the in-flight case keeps v1's rules, a new case gets v2's
const refNew = await start(custB, "000000337", "parity37@example.com");
await toReview(custB, refNew);
const oldDecline = await http(uw, "POST", `${A(refOld)}/decline`, { reason: "" });
check("in-flight case (pinned to v1) still requires a decline reason", oldDecline.status === 400, `status ${oldDecline.status}`);
const newDecline = await http(uw, "POST", `${A(refNew)}/decline`, { reason: "" });
check("new case (pinned to v2) no longer requires one", newDecline.status === 200 && newDecline.body.status === "DECLINED", `status ${newDecline.status}`);
const list3 = (await http(admin, "GET", "/api/auth/admin/workflow/definitions")).body;
check("case counts show the split between versions", list3.find((d) => d.id === v1.id).caseCount >= 1 && list3.find((d) => d.id === d1.body.id).caseCount >= 1, JSON.stringify(list3.map((d) => [d.version, d.caseCount])));

// ---- publish safety: cannot drop a status that live cases are still in
const refGone = await start(custC, "000000338", "parity38@example.com");
await http(custC, "POST", `${A(refGone)}/cancel`); // -> WITHDRAWN under v2
const d3 = (await http(admin, "POST", "/api/auth/admin/workflow/definitions/loan-origination/draft", {})).body;
const v3def = structuredClone((await http(admin, "GET", `/api/auth/admin/workflow/definitions/${d3.id}`)).body.definition);
v3def.tracks[0].transitions = v3def.tracks[0].transitions.filter((t) => t.key !== "cancel");
v3def.tracks[0].statuses = v3def.tracks[0].statuses.filter((s) => s.key !== "WITHDRAWN");
const saved3 = await http(admin, "PUT", `/api/auth/admin/workflow/definitions/${d3.id}`, { definition: v3def });
check("a draft that removes a status is structurally valid", saved3.status === 200, JSON.stringify(saved3.body).slice(0, 200));
const pub3 = await http(admin, "POST", `/api/auth/admin/workflow/definitions/${d3.id}/publish`);
check("publishing is refused while cases sit in the removed status", pub3.status === 400 && pub3.body.errors.some((e) => /WITHDRAWN/.test(e)), JSON.stringify(pub3.body).slice(0, 200));
check("a draft can be discarded", (await http(admin, "DELETE", `/api/auth/admin/workflow/definitions/${d3.id}`)).status === 204);
check("a published version cannot be discarded", (await http(admin, "DELETE", `/api/auth/admin/workflow/definitions/${d1.body.id}`)).status === 409);

// ---- allowed actions for the UI
const refAct = await start(custD, "000000339", "parity39@example.com");
await toReview(custD, refAct);
const uwActs = await http(uw, "GET", `/api/workflow/cases/${refAct}/actions`);
const keys = (r) => r.body.allowed.map((a) => a.key);
check("underwriter's allowed actions include the decisions", uwActs.status === 200 && ["approve", "decline", "send_back", "refer"].every((k) => keys(uwActs).includes(k)), JSON.stringify(uwActs.body).slice(0, 200));
check("each action carries a bilingual label", uwActs.body.allowed.every((a) => a.label?.en && a.label?.he));
check("disbursement is blocked until approval", uwActs.body.blocked?.authorise?.code === "INVALID_STATE", JSON.stringify(uwActs.body.blocked));
const ownerActs = await http(custD, "GET", `/api/workflow/cases/${refAct}/actions`);
check("the owning customer may cancel or withdraw", ownerActs.status === 200 && ["cancel", "withdraw"].every((k) => keys(ownerActs).includes(k)) && !keys(ownerActs).includes("approve"), JSON.stringify(ownerActs.body).slice(0, 200));
check("another customer cannot even ask (404)", (await http(custA, "GET", `/api/workflow/cases/${refAct}/actions`)).status === 404);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
