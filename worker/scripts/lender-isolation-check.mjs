#!/usr/bin/env node
// Cross-lender isolation check against a running worker that has TWO active lenders:
//   node scripts/lender-isolation-check.mjs --base http://127.0.0.1:8799 --a DIGI --b BETA
// Needs: lender A's seeded admin (national ID 000000015) and a lender-B ADMIN with national ID
// 000000502 (a copy of A's roles and entitlements is enough). Customers are registered by the
// script itself through the public API (demo OTP), so use a scratch database. It creates test data
// in both lenders and asserts that nothing one lender does is visible to, or changeable by, the other.

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const BASE = opt("base"), A = opt("a", "DIGI"), B = opt("b", "BETA");
const RUN = Date.now().toString().slice(-6);
let passed = 0, failed = 0;
const check = (name, ok, extra = "") => { (ok ? passed++ : failed++); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   " + extra}`); };

async function http(token, method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
const ok = (r) => r.status >= 200 && r.status < 300;
const denied = (r) => r.status >= 400;
const data = (r) => (r.body && typeof r.body === "object" && "data" in r.body ? r.body.data : r.body);

async function login(nationalId, lenderCode) {
  const o = await http(null, "POST", "/api/auth/login/request-otp", { nationalId, lenderCode });
  const v = await http(null, "POST", "/api/auth/login/verify-otp", { nationalId, lenderCode, otp: data(o).demoOtp });
  lastLenderId = data(v).lenderId;
  return data(v).token;
}
let lastLenderId;
async function register(lenderCode, n) {
  const nationalId = `7${RUN}${n}`.padEnd(9, "0").slice(0, 9);
  const email = `cust${n}.${RUN}@${lenderCode.toLowerCase()}.test`;
  const r = await http(null, "POST", "/api/auth/register", { lenderCode, email, nationalId, idIssueDate: "2015-01-01", fullName: `Customer ${lenderCode}`, phoneNumber: "0500000000" });
  const v = await http(null, "POST", "/api/auth/register/verify-otp", { email, lenderCode, otp: data(r).demoOtp });
  const d = data(v);
  return { token: d.token, id: d.userId, email, nationalId };
}

const adminA = await login("000000015", A);
const adminB = await login("000000502", B);
const lenderBId = lastLenderId;
const custA = await register(A, 1);
const custB = await register(B, 2);
check("setup: four sessions", !!adminA && !!adminB && !!custA.token && !!custB.token && !!custA.id && !!custB.id);
if (failed) process.exit(1);

// ---- applications: a customer, and staff, of one lender cannot see or touch the other's
const startA = await http(custA.token, "POST", "/api/applications/start", { customerId: custA.id, customerEmail: custA.email });
const refA = data(startA)?.applicationRef ?? startA.body?.applicationRef;
check("A's customer starts an application", !!refA, JSON.stringify(startA.body));
const startB = await http(custB.token, "POST", "/api/applications/start", { customerId: custB.id, customerEmail: custB.email });
const refB = data(startB)?.applicationRef ?? startB.body?.applicationRef;
check("B's customer starts an application", !!refB, JSON.stringify(startB.body));
const startX = await http(custB.token, "POST", "/api/applications/start", { customerId: custA.id, customerEmail: custA.email });
check("B cannot start an application for A's customer id", denied(startX), JSON.stringify(startX.body));

for (const [who, token] of [["B customer", custB.token], ["B admin", adminB]]) {
  check(`${who} cannot read A's application`, denied(await http(token, "GET", `/api/applications/${refA}`)));
  check(`${who} cannot read A's notes`, !(await http(token, "GET", `/api/applications/${refA}/notes`)).body?.length);
  check(`${who} cannot read A's workflow state`, denied(await http(token, "GET", `/api/workflow/cases/${refA}/state`)));
  check(`${who} cannot run an action on A's case`, denied(await http(token, "POST", `/api/workflow/cases/${refA}/actions/cancel`, {})));
  check(`${who} cannot save a section on A's application`, denied(await http(token, "PUT", `/api/applications/${refA}/section`, { section: "loanRequirements", data: {} })));
  check(`${who} sees none of A's documents`, ((await http(token, "GET", `/api/documents/application/${refA}`)).body?.length ?? 0) === 0);
  check(`${who} cannot upload to A's application`, denied(await http(token, "POST", "/api/documents/generate", { applicationRef: refA, customerId: custA.id, documentType: "APPROVAL_LETTER", customerName: "x", loanAmount: 1, productName: "p", interestRate: 1, termMonths: 1, monthlyRepayment: 1 })));
  check(`${who} cannot select a product on A's application`, denied(await http(token, "POST", "/api/products/select", { applicationRef: refA, productCode: "X" })));
}
check("B customer cannot list A customer's applications", denied(await http(custB.token, "GET", `/api/applications/customer/${custA.id}`)) || (await http(custB.token, "GET", `/api/applications/customer/${custA.id}`)).body.length === 0);
check("B customer's own application is readable", ok(await http(custB.token, "GET", `/api/applications/${refB}`)));
if (!refA || !refB) { console.log("cannot continue without both applications"); process.exit(1); }

const pipeA = (await http(adminA, "GET", "/api/applications/pipeline")).body;
const pipeB = (await http(adminB, "GET", "/api/applications/pipeline")).body;
const refsIn = (rows) => (Array.isArray(rows) ? rows.map((r) => r.applicationRef) : []);
check("pipelines are per lender", !refsIn(pipeB).includes(refA) && !refsIn(pipeA).includes(refB), JSON.stringify([refsIn(pipeA), refsIn(pipeB)]));

// ---- users
const custsA = data(await http(adminA, "GET", "/api/auth/admin/users?type=customers")).map((u) => u.email);
const custsB = data(await http(adminB, "GET", "/api/auth/admin/users?type=customers")).map((u) => u.email);
check("A's admin lists only A's customers", custsA.includes(custA.email) && !custsA.includes(custB.email));
check("B's admin lists only B's customers", custsB.includes(custB.email) && !custsB.includes(custA.email));
check("B's admin cannot disable A's customer", denied(await http(adminB, "PUT", `/api/auth/admin/users/${custA.id}/enabled`, { enabled: false })));
check("B's admin cannot delete A's customer", denied(await http(adminB, "DELETE", `/api/auth/admin/users/${custA.id}`)));
check("B's admin cannot read A's customer profile", denied(await http(adminB, "GET", `/api/auth/customer-profile/${custA.id}`)));
check("A's customer is still enabled", ok(await http(custA.token, "GET", `/api/applications/${refA}`)));

// ---- configuration: the same code can exist in both lenders, and neither sees the other's
const same = `ISO_${RUN}`;
const fa = await http(adminA, "POST", "/api/auth/admin/faqs", { category: "T", question: `Q-A-${RUN}`, answer: "a", displayOrder: 1 });
const fb = await http(adminB, "POST", "/api/auth/admin/faqs", { category: "T", question: `Q-B-${RUN}`, answer: "b", displayOrder: 1 });
check("each lender creates a FAQ", ok(fa) && ok(fb));
const faqsA = (await http(adminA, "GET", "/api/auth/admin/faqs")).body.map((f) => f.question);
const faqsB = (await http(adminB, "GET", "/api/auth/admin/faqs")).body.map((f) => f.question);
check("FAQs are per lender", faqsA.includes(`Q-A-${RUN}`) && !faqsA.includes(`Q-B-${RUN}`) && faqsB.includes(`Q-B-${RUN}`) && !faqsB.includes(`Q-A-${RUN}`));
check("B's admin cannot change A's FAQ", denied(await http(adminB, "PUT", `/api/auth/admin/faqs/${fa.body.id}`, { category: "T", question: "hacked", answer: "x" })) || (await http(adminA, "GET", "/api/auth/admin/faqs")).body.some((f) => f.question === `Q-A-${RUN}`));
check("public FAQs follow ?lender=", ((await http(null, "GET", `/api/auth/faqs?lender=${B}`)).body ?? []).every((f) => f.question !== `Q-A-${RUN}`));

const roleBody = { code: same, label: "Iso", scope: "ALL", entitlements: [] };
check("both lenders create a role with the same code", ok(await http(adminA, "POST", "/api/auth/admin/roles", roleBody)) && ok(await http(adminB, "POST", "/api/auth/admin/roles", roleBody)));
check("deleting a role in B leaves A's role of the same code", ok(await http(adminB, "DELETE", `/api/auth/admin/roles/${same}`)) && (await http(adminA, "GET", "/api/auth/admin/roles")).body.roles.some((r) => r.code === same));

const prodBody = { productCode: `PR_${RUN}`, productName: "P", annualInterestRate: 5, minAmount: 1, maxAmount: 9, minTermMonths: 1, maxTermMonths: 9, active: true };
check("both lenders create a product with the same code", ok(await http(adminA, "POST", "/api/products/admin", prodBody)) && ok(await http(adminB, "POST", "/api/products/admin", { ...prodBody, lenderId: 1 })));
const prodsB = (await http(adminB, "GET", "/api/products/admin/all")).body;
check("a body cannot name another lender (lenderId in a product body is ignored)", prodsB.filter((p) => p.productCode === prodBody.productCode).every((p) => p.lenderId === lenderBId));
check("products are per lender", (await http(adminA, "GET", "/api/products/admin/all")).body.filter((p) => p.productCode === prodBody.productCode).length === 1);

const mt = { labelEn: `Colour ${RUN}`, labelHe: "צבע" };
const ma = await http(adminA, "POST", "/api/auth/admin/masters/types", mt);
const mb = await http(adminB, "POST", "/api/auth/admin/masters/types", mt);
check("both lenders create a master of the same name", ok(ma) && ok(mb), JSON.stringify([ma.body, mb.body]));
const mItemA = await http(adminA, "POST", `/api/auth/admin/masters/types/${ma.body.code}/items`, { nameEn: "Red", nameHe: "אדום" });
const mListB = await http(adminB, "GET", `/api/auth/admin/masters/types/${mb.body.code}/items`);
check("master items are per lender", ok(mItemA) && ok(mListB) && mListB.body.items.length === 0);
check("B cannot edit A's master item", denied(await http(adminB, "PUT", `/api/auth/admin/masters/items/${mItemA.body.id}`, { nameEn: "Hacked", nameHe: "x" })));
check("B cannot delete A's master item", denied(await http(adminB, "DELETE", `/api/auth/admin/masters/items/${mItemA.body.id}`)));
const pubNoLender = await http(null, "GET", "/api/masters?types=title");
check("public pick-lists need a lender when there are several", pubNoLender.status === 400, String(pubNoLender.status));
check("public pick-lists work with ?lender=", ok(await http(null, "GET", `/api/masters?types=title&lender=${A}`)));

const orgA = await http(adminA, "POST", "/api/auth/admin/org/levels", { name: `Lvl ${RUN}`, depth: 9 });
const orgB = await http(adminB, "POST", "/api/auth/admin/org/levels", { name: `Lvl ${RUN}`, depth: 9 });
check("both lenders create an org level of the same name", ok(orgA) && ok(orgB));
await http(adminB, "DELETE", `/api/auth/admin/org/levels/${orgA.body.id}`);
check("B cannot delete A's org level", (await http(adminA, "GET", "/api/auth/admin/org")).body.levels.some((l) => l.id === orgA.body.id));
check("org structure is per lender", !(await http(adminB, "GET", "/api/auth/admin/org")).body.levels.some((l) => l.id === orgA.body.id));

const wfA = (await http(adminA, "GET", "/api/auth/admin/workflow/definitions")).body;
const wfB = (await http(adminB, "GET", "/api/auth/admin/workflow/definitions")).body;
check("each lender has its own workflow definitions", wfA.length > 0 && wfB.length > 0 && !wfB.some((d) => wfA.some((a) => a.id === d.id)));
check("B cannot read A's workflow definition", denied(await http(adminB, "GET", `/api/auth/admin/workflow/definitions/${wfA[0].id}`)));
check("B cannot discard or publish A's draft", denied(await http(adminB, "POST", `/api/auth/admin/workflow/definitions/${wfA[0].id}/publish`)) && denied(await http(adminB, "DELETE", `/api/auth/admin/workflow/definitions/${wfA[0].id}`)));

const fvA = (await http(adminA, "GET", "/api/auth/admin/form-builder/forms")).body;
check("form builder lists work per lender", Array.isArray(fvA));
const verA = (await http(adminA, "GET", "/api/auth/admin/form-builder/forms/personal-loan-wizard/versions")).body;
if (Array.isArray(verA) && verA.length) {
  check("B cannot read A's form version", denied(await http(adminB, "GET", `/api/auth/admin/form-builder/versions/${verA[0].id}`)));
}

// branding and affordability rules
await http(adminA, "PUT", "/api/auth/admin/branding", { primaryColor: "#112233" });
await http(adminB, "PUT", "/api/auth/admin/branding", { primaryColor: "#445566" });
check("branding is per lender", (await http(null, "GET", `/api/branding?lender=${A}`)).body.primaryColor === "#112233" && (await http(null, "GET", `/api/branding?lender=${B}`)).body.primaryColor === "#445566");
check("public branding without a lender is neutral when several exist", (await http(null, "GET", "/api/branding")).body.logoUrl === null);
await http(adminB, "PUT", "/api/affordability/rules", { maxDti: 11 });
check("affordability rules are per lender", (await http(adminA, "GET", "/api/affordability/rules")).body.maxDti !== 11 && (await http(adminB, "GET", "/api/affordability/rules")).body.maxDti === 11);

// letters
const la = await http(adminA, "POST", "/api/auth/admin/letters/templates", { nameEn: `Letter ${RUN}`, appliesTo: "BOTH" });
check("A creates a letter", ok(la), JSON.stringify(la.body));
check("B cannot see or open A's letter", denied(await http(adminB, "GET", `/api/auth/admin/letters/templates/${la.body.key}`)) && !(await http(adminB, "GET", "/api/auth/admin/letters/templates")).body.some((t) => t.key === la.body.key));

// notifications
const nA = (await http(custA.token, "GET", `/api/notifications/customer/${custA.id}`)).body;
check("B cannot read A's notifications", denied(await http(custB.token, "GET", `/api/notifications/customer/${custA.id}`)));
check("B cannot create a notification for A's customer", denied(await http(adminB, "POST", "/api/notifications/create", { customerId: custA.id, title: "x", message: "y" })));

// forged lender claims
const forged = await http(adminB, "GET", `/api/applications/${refA}`);
check("a lender-B token never resolves a lender-A reference", denied(forged));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
