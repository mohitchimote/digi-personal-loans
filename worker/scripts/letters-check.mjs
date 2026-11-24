#!/usr/bin/env node
// Letters safety check against a running worker (scratch database seeded like platform-check.mjs):
//   node scripts/letters-check.mjs --base http://127.0.0.1:8790
// Uses DIGI's admin (000000015), underwriter (000000014) and banker (000000027). It changes role scopes,
// entitlements and org units of those users, so point it at a scratch database.
const args = process.argv.slice(2);
const BASE = args[args.indexOf("--base") + 1];
const RUN = Date.now().toString().slice(-6);
let passed = 0, failed = 0;
const check = (name, ok, extra = "") => { (ok ? passed++ : failed++); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   " + extra}`); };
async function http(token, method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
const data = (r) => (r.body && typeof r.body === "object" && "data" in r.body ? r.body.data : r.body);
async function login(nationalId, lenderCode) {
  const o = await http(null, "POST", "/api/auth/login/request-otp", { nationalId, lenderCode });
  return data(await http(null, "POST", "/api/auth/login/verify-otp", { nationalId, lenderCode, otp: data(o).demoOtp }));
}
const png = (w, h) => { const b = Buffer.alloc(32); b.set([0x89, 0x50, 0x4e, 0x47], 0); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b.toString("base64"); };

const admin = (await login("000000015", "DIGI")).token;
const uwUser = (await http(admin, "GET", "/api/auth/admin/users?type=staff")).body.find((u) => u.nationalId === "000000014");
const bkUser = (await http(admin, "GET", "/api/auth/admin/users?type=staff")).body.find((u) => u.nationalId === "000000027");
const units = (await http(admin, "GET", "/api/auth/admin/org")).body.units;
check("setup: two different org units exist", units.length >= 2);
const [unitA, unitB] = units;

// roles: both may issue letters; the underwriter is limited to its own unit
const roles = (await http(admin, "GET", "/api/auth/admin/roles")).body.roles;
for (const [code, scope] of [["UNDERWRITER", "UNIT_ONLY"], ["BANKER", "UNIT_ONLY"]]) {
  const r = roles.find((x) => x.code === code);
  const put = await http(admin, "PUT", `/api/auth/admin/roles/${code}`, { label: r.label, description: r.description, scope, escalationRank: r.escalationRank, entitlements: [...new Set([...r.entitlements, "letters.issue"])] });
  check(`${code} may issue letters, scope ${scope}`, put.status === 200, JSON.stringify(put.body));
}
await http(admin, "PUT", `/api/auth/admin/users/${uwUser.id}/org-unit`, { orgUnitId: unitA.id });
await http(admin, "PUT", `/api/auth/admin/users/${bkUser.id}/org-unit`, { orgUnitId: unitB.id });
// Tokens carry whole seconds; one issued in the same second as the revocation these changes trigger is refused.
await new Promise((r) => setTimeout(r, 1500));
const uw = (await login("000000014", "DIGI")).token, bk = (await login("000000027", "DIGI")).token;

// a case that belongs to the banker's unit
const nid = `5${RUN}00`.slice(0, 9), email = `ltr${RUN}@t.test`;
const reg = await http(null, "POST", "/api/auth/register", { email, nationalId: nid, idIssueDate: "2015-01-01", fullName: "Letter Customer" });
const cust = data(await http(null, "POST", "/api/auth/register/verify-otp", { email, otp: data(reg).demoOtp }));
const started = await http(bk, "POST", "/api/applications/start", { customerId: cust.userId, customerEmail: email });
const ref = data(started)?.applicationRef ?? started.body?.applicationRef;
check("the banker opens a case in the banker's unit", !!ref && started.body.orgUnitId === unitB.id, JSON.stringify(started.body).slice(0, 200));
if (!ref) process.exit(1);

// a published letter
const tpl = await http(admin, "POST", "/api/auth/admin/letters/templates", { nameEn: `Check ${RUN}`, appliesTo: "BOTH", starter: true });
const key = tpl.body.key;
const pub1 = await http(admin, "POST", `/api/auth/admin/letters/templates/${key}/publish`);
check("a letter is published", pub1.status === 200, JSON.stringify(pub1.body).slice(0, 300));

// ---- 1. case visibility on the staff letter endpoints
const attempts = [["GET", `/api/letters/available/${ref}`], ["GET", `/api/letters/issued/${ref}`], ["POST", "/api/letters/issue", { templateKey: key, applicationRef: ref }], ["GET", `/api/letters/issued/${ref}/1/pdf`]];
for (const [m, p, b] of attempts) {
  const r = await http(uw, m, p, b);
  check(`out of scope: ${m} ${p.replace(ref, ":ref")} is not found for the underwriter`, r.status === 404, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
}
check("in scope: the banker sees the available letters", (await http(bk, "GET", `/api/letters/available/${ref}`)).status === 200);
check("in scope: issuing passes the visibility check (it then reports missing application data, not 'not found')", [409, 422, 201].includes((await http(bk, "POST", "/api/letters/issue", { templateKey: key, applicationRef: ref })).status));
check("an administrator (scope ALL) sees the available letters", (await http(admin, "GET", `/api/letters/available/${ref}`)).status === 200);

// ---- 2. publishing swaps versions in one step
const doc = (await http(admin, "GET", `/api/auth/admin/letters/templates/${key}/versions/published`)).body.document;
await http(admin, "PUT", `/api/auth/admin/letters/templates/${key}/draft`, { document: doc, changeNote: "v2" });
const pub2 = await http(admin, "POST", `/api/auth/admin/letters/templates/${key}/publish`);
const versions = (await http(admin, "GET", `/api/auth/admin/letters/templates/${key}`)).body.versions;
check("a second publish leaves exactly one published version and archives the first", pub2.status === 200 && versions.filter((v) => v.status === "PUBLISHED").length === 1 && versions.filter((v) => v.status === "ARCHIVED").length === 1, JSON.stringify(versions.map((v) => [v.version, v.status])));

// ---- 3. in-use checks read the stored letter, not text patterns
const rule = await http(admin, "POST", "/api/auth/admin/letters/rules", { name: `Check rule ${RUN}`, rule: { t: "condition", field: "guarantor.required", op: "isYes" } });
const ruleId = rule.body.id;
check("a saved rule is created", rule.status === 201, JSON.stringify(rule.body).slice(0, 200));
const withRef = { ...doc, body: [{ id: "w1", t: "when", rule: { t: "ref", id: ruleId }, children: [] }] };
await http(admin, "PUT", `/api/auth/admin/letters/templates/${key}/draft`, { document: withRef });
check("a rule used by a letter cannot be deleted", (await http(admin, "DELETE", `/api/auth/admin/letters/rules/${ruleId}`)).status === 409);
const spare = await http(admin, "POST", "/api/auth/admin/letters/rules", { name: `Spare ${RUN}`, rule: { t: "condition", field: "guarantor.required", op: "isNo" } });
check("an unused rule is created and can be deleted", spare.status === 201 && (await http(admin, "DELETE", `/api/auth/admin/letters/rules/${spare.body.id}`)).status === 200, JSON.stringify(spare.body).slice(0, 160));

// ---- 6. picture upload limits
const small = await http(admin, "POST", "/api/auth/admin/letters/images", { name: "ok", kind: "logo", dataBase64: png(40, 20) });
check("a small picture is accepted", small.status === 201, JSON.stringify(small.body).slice(0, 200));
const huge = await http(admin, "POST", "/api/auth/admin/letters/images", { name: "big", kind: "logo", dataBase64: "A".repeat(800_000) });
check("an oversized upload is refused before it is decoded", huge.status === 400, `${huge.status}`);
const wide = await http(admin, "POST", "/api/auth/admin/letters/images", { name: "wide", kind: "logo", dataBase64: png(6000, 6000) });
check("a picture declaring a huge size is refused", wide.status === 400 && /pixels/.test(wide.body?.message ?? ""), JSON.stringify(wide.body).slice(0, 200));
const usedImg = await http(admin, "PUT", `/api/auth/admin/letters/templates/${key}/draft`, { document: { ...doc, header: [{ id: "i1", t: "image", imageId: small.body.id, alt: { en: "x", he: "x" } }] } });
check("a picture used by a letter cannot be deleted", (await http(admin, "DELETE", `/api/auth/admin/letters/images/${small.body.id}`)).status === 409, JSON.stringify(usedImg.body).slice(0, 120));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
