#!/usr/bin/env node
// Super admin console check against a running worker (scratch database):
//   node scripts/platform-check.mjs --base http://127.0.0.1:8798
// Needs a SUPER_ADMIN with national ID 000000099 and lender DIGI seeded with roles, masters, org units,
// workflow and form versions. Creates a lender by cloning DIGI and checks the copy, entering, suspending.
import http1 from "node:http";
const args = process.argv.slice(2);
const BASE = args[args.indexOf("--base") + 1];
const RUN = Date.now().toString().slice(-5);
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
  const v = await http(null, "POST", "/api/auth/login/verify-otp", { nationalId, lenderCode, otp: data(o).demoOtp });
  return data(v);
}

// Signs in the way a browser does and reports what happened: a token, a picker, or nothing.
async function attempt(nationalId, lenderCode, send = http_) {
  const o = await send("POST", "/api/auth/login/request-otp", { nationalId, lenderCode });
  if (!o.body?.success) return { stage: "request", res: o };
  if (o.body.data.requiresLenderChoice) return { picker: o.body.data.lenders.map((l) => l.code), res: o };
  const v = await send("POST", "/api/auth/login/verify-otp", { nationalId, lenderCode, otp: o.body.data.demoOtp });
  return { token: v.body?.data?.token ?? null, shape: Object.keys(o.body.data).sort().join(","), message: v.body?.message, res: o };
}
const http_ = (m, p, b) => http(null, m, p, b);

const sa = await login("000000099");
check("super admin signs in at platform level", sa?.role === "SUPER_ADMIN" && sa.lenderId === null, JSON.stringify(sa));
const saTok = sa.token;
const digiAdmin = (await login("000000015", "DIGI")).token;
check("a lender admin is refused the platform console", (await http(digiAdmin, "GET", "/api/platform/lenders")).status === 403);
check("a platform token has no lender, so lender screens ask for one", (await http(saTok, "GET", "/api/auth/admin/roles")).status === 400);

const list = data(await http(saTok, "GET", "/api/platform/lenders"));
const digi = list.find((l) => l.code === "DIGI");
check("lists lenders with counts", !!digi && digi.users > 0, JSON.stringify(list));

const code = `T${RUN}`;
const adminNid = `8${RUN}0000`.slice(0, 9);
const bad = await http(saTok, "POST", "/api/platform/lenders", { code: "digi", name: "dup", cloneFromLenderId: digi.id, admin: { fullName: "A", email: "a@x.test", nationalId: adminNid } });
check("an existing code is refused", bad.status >= 400);
const made = await http(saTok, "POST", "/api/platform/lenders", { code, name: `Test Bank ${RUN}`, cloneFromLenderId: digi.id, admin: { fullName: "Test Admin", email: `admin${RUN}@t.test`, nationalId: adminNid } });
check("creates a lender by cloning DIGI", made.status === 201, JSON.stringify(made.body));
const newId = data(made)?.lender?.id;
if (!newId) process.exit(1);
console.log("  masters without items:", JSON.stringify(data(made).mastersWithoutItems));

// the new lender's own admin signs in and sees a full copy of the configuration, and none of DIGI's data
const na = await login(adminNid, code);
check("the new lender's admin signs in", na?.lenderCode === code && na.role === "ADMIN", JSON.stringify(na));
const T = na.token, D = digiAdmin;
const get = async (tok, p) => data(await http(tok, "GET", p));
const same = async (name, path, pick) => { const a = pick(await get(D, path)), b = pick(await get(T, path)); check(`${name}: copied (${b})`, a === b && b > 0, `digi=${a} new=${b}`); };
await same("roles", "/api/auth/admin/roles", (r) => r.roles.length);
await same("role entitlements", "/api/auth/admin/roles", (r) => r.roles.reduce((n, x) => n + x.entitlements.length, 0));
await same("master types", "/api/auth/admin/masters/types", (r) => r.length);
await same("org levels", "/api/auth/admin/org", (r) => r.levels.length);
await same("org units", "/api/auth/admin/org", (r) => r.units.length);
await same("products", "/api/products/admin/all", (r) => r.length);
await same("FAQs", "/api/auth/admin/faqs", (r) => r.length);
const orgD = await get(D, "/api/auth/admin/org"), orgT = await get(T, "/api/auth/admin/org");
const idsD = new Set([...orgD.levels, ...orgD.units].map((x) => x.id));
check("org units point at the new lender's own levels and parents", orgT.units.every((u) => !idsD.has(u.id) && orgT.levels.some((l) => l.id === u.levelId) && (u.parentId == null || orgT.units.some((p) => p.id === u.parentId))));
check("unit parent structure is preserved", orgT.units.filter((u) => u.parentId != null).length === orgD.units.filter((u) => u.parentId != null).length);
const itemsOf = async (tok, t) => (await get(tok, `/api/auth/admin/masters/types/${t}/items?limit=500`)).total;
for (const t of ["title", "country", "branch"]) { const a = await itemsOf(D, t).catch(() => null), b = await itemsOf(T, t).catch(() => null); if (a != null) check(`master items of ${t} copied (${b})`, a === b, `digi=${a} new=${b}`); }
const stateT = await get(T, "/api/masters/state?lender=" + code).catch(() => null);
const wfT = await get(T, "/api/auth/admin/workflow/definitions");
check("the published workflow is version 1 of the new lender", wfT.length === 1 && wfT[0].version === 1 && wfT[0].status === "PUBLISHED", JSON.stringify(wfT));
const fvT = await get(T, "/api/auth/admin/form-builder/forms/personal-loan-wizard/versions");
check("published form versions are version 1", Array.isArray(fvT) && fvT.length === 1 && fvT[0].version === 1 && fvT[0].status === "PUBLISHED", JSON.stringify(fvT));
check("no customers or cases were copied", (await get(T, "/api/auth/admin/users?type=customers")).length === 0 && (await get(T, "/api/applications/pipeline")).length === 0);
check("pick-lists work for the new lender", (await http(null, "GET", `/api/masters?types=title&lender=${code}`)).status === 200);

// entering and leaving
const entered = data(await http(saTok, "POST", `/api/platform/lenders/${newId}/enter`));
check("entering gives a super admin token inside the lender", entered?.role === "SUPER_ADMIN" && entered.lenderCode === code, JSON.stringify(entered));
const inside = entered.token;
const roleCount = (await get(inside, "/api/auth/admin/roles")).roles.length;
check("inside the lender the ordinary admin screens work", roleCount > 0);
check("a lender admin cannot enter a lender", (await http(T, "POST", `/api/platform/lenders/${digi.id}/enter`)).status === 403);
const audit = await get(inside, "/api/auth/admin/users");
const left = data(await http(inside, "POST", "/api/platform/exit"));
check("exiting returns to platform level", left?.lenderId === null && (await http(left.token, "GET", "/api/auth/admin/roles")).status === 400);

// suspend / activate
await http(saTok, "POST", `/api/platform/lenders/${newId}/suspend`);
check("a suspended lender's admin is refused", (await http(T, "GET", "/api/auth/admin/roles")).status === 401);
check("a suspended lender's admin cannot sign in", !(await attempt(adminNid, code)).token);
check("the other lender is unaffected", (await http(D, "GET", "/api/auth/admin/roles")).status === 200);
await http(saTok, "POST", `/api/platform/lenders/${newId}/activate`);
check("activating restores access", (await http(T, "GET", "/api/auth/admin/roles")).status === 200);
const ren = await http(saTok, "PUT", `/api/platform/lenders/${newId}`, { name: "Renamed Bank" });
check("renames a lender", ren.body?.name === "Renamed Bank");

// ---- lender hosts: a lender's own address identifies it
const hostReq = (host, method, path, body) => new Promise((resolve, reject) => {
  const u = new URL(BASE);
  const req = http1.request({ host: u.hostname, port: u.port, method, path, headers: { Host: host, "Content-Type": "application/json" } }, (res) => {
    let t = ""; res.on("data", (d) => (t += d)); res.on("end", () => { let j; try { j = JSON.parse(t); } catch { j = t; } resolve({ status: res.statusCode, body: j }); });
  });
  req.on("error", reject); if (body !== undefined) req.write(JSON.stringify(body)); req.end();
});
const myHost = `bank-${RUN}.example.test`;
check("a shared address with several lenders asks for a lender code", (await http(null, "GET", "/api/auth/context")).body.choiceNeeded === true);
check("an invalid host is refused", (await http(saTok, "PUT", `/api/platform/lenders/${newId}/domains`, { domains: ["not a host"] })).status >= 400);
check("a lender admin cannot set domains", (await http(T, "PUT", `/api/platform/lenders/${newId}/domains`, { domains: [myHost] })).status === 403);
const setD = await http(saTok, "PUT", `/api/platform/lenders/${newId}/domains`, { domains: [`https://${myHost.toUpperCase()}/login`] });
check("saves a lender's address (normalised)", setD.body?.domains?.[0] === myHost, JSON.stringify(setD.body));
check("the same address cannot belong to two lenders", (await http(saTok, "PUT", `/api/platform/lenders/${digi.id}/domains`, { domains: [myHost] })).status >= 400);
check("the console lists the address", (await get(saTok, "/api/platform/lenders")).find((l) => l.id === newId).domains.includes(myHost));
const ctx = await hostReq(myHost, "GET", "/api/auth/context");
check("on the lender's address the context names the lender and needs no code", ctx.body.hostMapped && ctx.body.lender?.code === code && ctx.body.choiceNeeded === false, JSON.stringify(ctx.body));
const atHost = (m, p, b) => hostReq(myHost, m, p, b);
check("login on the lender's address works without a code", !!(await attempt(adminNid, undefined, atHost)).token);
check("a code naming another lender is ignored on the lender's address (DIGI's admin cannot sign in)", !(await attempt("000000015", "DIGI", atHost)).token);
check("the platform admin cannot sign in on a lender's address", !(await attempt("000000099", undefined, atHost)).token);
const reg = await hostReq(myHost, "POST", "/api/auth/register", { lenderCode: "DIGI", email: `host${RUN}@x.test`, nationalId: `6${RUN}000`.slice(0, 9), idIssueDate: "2015-01-01", fullName: "Host Test" });
check("registration on the lender's address lands in that lender, whatever code was sent", reg.body?.data?.lenderCode === code, JSON.stringify(reg.body));
const br = await hostReq(myHost, "GET", "/api/branding");
check("branding follows the address", br.status === 200 && br.body.primaryColor !== undefined);
check("pick-lists need no code on the lender's address", (await hostReq(myHost, "GET", "/api/masters?types=title")).status === 200);
check("an unmapped address still asks for a code", (await hostReq("other.example.test", "GET", "/api/masters?types=title")).status === 400);
// ---- item 1: a lender with its own address cannot be signed in to by code on a shared address
check("knowing the lender code on a shared address is not enough once the lender has its own address", !(await attempt(adminNid, code)).token);
const regShared = await http(null, "POST", "/api/auth/register", { lenderCode: code, email: `shared${RUN}@x.test`, nationalId: `4${RUN}000`.slice(0, 9), idIssueDate: "2015-01-01", fullName: "Shared Test" });
check("registering with the code on a shared address is refused for such a lender", regShared.status >= 400, JSON.stringify(regShared.body));
check("a lender without its own address still works by code on a shared address", !!(await attempt("000000015", "DIGI")).token);

// ---- item 2: answers do not reveal whether an account exists
const known = await attempt("000000015", "DIGI"), unknown = await attempt("123456780", "DIGI");
check("a known and an unknown National ID get the same shaped answer", known.shape === unknown.shape && known.shape.includes("demoOtp"), `${known.shape} vs ${unknown.shape}`);
check("an unknown National ID cannot sign in, with the generic message", !unknown.token && /incorrect or has expired/.test(unknown.message ?? ""), JSON.stringify(unknown.message));
const wrongOtp = await http(null, "POST", "/api/auth/login/verify-otp", { nationalId: "000000015", lenderCode: "DIGI", otp: "000000" });
check("a wrong code fails with the same message as an unknown ID", wrongOtp.status === 401 && wrongOtp.body.message === unknown.message, JSON.stringify(wrongOtp.body));
const noReq = await http(null, "POST", "/api/auth/login/verify-otp", { nationalId: "000000014", lenderCode: "DIGI", otp: "123456" });
check("no code ever requested fails with the same message", noReq.status === 401 && noReq.body.message === unknown.message, JSON.stringify(noReq.body));
const dis = await http(digiAdmin, "PUT", `/api/auth/admin/users/${(await get(digiAdmin, "/api/auth/admin/users?type=staff")).find((u) => u.nationalId === "000000014").id}/enabled`, { enabled: false });
const disAttempt = await attempt("000000014", "DIGI");
check("a disabled account looks like an unknown one", !disAttempt.token && disAttempt.shape === unknown.shape && disAttempt.message === unknown.message, JSON.stringify(disAttempt.message));
await http(digiAdmin, "PUT", `/api/auth/admin/users/${(await get(digiAdmin, "/api/auth/admin/users?type=staff")).find((u) => u.nationalId === "000000014").id}/enabled`, { enabled: true });
check("it can be enabled again", !!(await attempt("000000014", "DIGI")).token);

// the picker: an ID with accounts at two lenders on a shared address lists only lenders reachable there
const twin = await http(saTok, "POST", "/api/platform/lenders", { code: `W${RUN}`, name: "Twin lender", cloneFromLenderId: digi.id, admin: { fullName: "Twin", email: `twin${RUN}@t.test`, nationalId: "000000015" } });
check("a second lender can have an admin with the same National ID", twin.status === 201, JSON.stringify(twin.body));
const picker1 = await attempt("000000015");
check("on a shared address the picker lists both lenders", Array.isArray(picker1.picker) && picker1.picker.includes("DIGI") && picker1.picker.includes(`W${RUN}`), JSON.stringify(picker1.picker));
await http(saTok, "PUT", `/api/platform/lenders/${data(twin).lender.id}/domains`, { domains: [`twin-${RUN}.example.test`] });
const picker2 = await attempt("000000015");
check("once that lender has its own address it disappears from the picker (single account: no picker, code issued)", !picker2.picker && !!picker2.token, JSON.stringify(picker2.picker));
check("and its admin signs in at its own address", !!(await attempt("000000015", undefined, (m, p, b) => hostReq(`twin-${RUN}.example.test`, m, p, b))).token);

const second = await http(saTok, "POST", "/api/platform/lenders", { code: `U${RUN}`, name: "Copy of host lender", cloneFromLenderId: newId, admin: { fullName: "U", email: `u${RUN}@t.test`, nationalId: `5${RUN}000`.slice(0, 9) } });
check("a clone does not inherit the address", second.status === 201 && (await get(saTok, "/api/platform/lenders")).find((l) => l.id === data(second).lender.id).domains.length === 0, JSON.stringify(second.body));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
