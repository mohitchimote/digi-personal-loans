#!/usr/bin/env node
// "Enter as" check against a running worker (scratch database), seeded as for platform-check.mjs:
//   node scripts/impersonation-check.mjs --base http://127.0.0.1:8794
// Uses DIGI's admin (000000015) and underwriter (000000014), the super admin (000000099), and creates
// a second lender to prove nobody can view users across lenders.
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
  return data(await http(null, "POST", "/api/auth/login/verify-otp", { nationalId, lenderCode, otp: data(o).demoOtp }));
}

const admin = (await login("000000015", "DIGI")).token;
const uwSession = await login("000000014", "DIGI");
const staff = data(await http(admin, "GET", "/api/auth/admin/users?type=staff"));
const uw = staff.find((u) => u.nationalId === "000000014"), adm = staff.find((u) => u.nationalId === "000000015");

// ---- starting
const entered = await http(admin, "POST", `/api/auth/admin/users/${uw.id}/enter-as`);
const view = data(entered);
check("an admin enters as an underwriter", entered.status === 200 && view.role === "UNDERWRITER" && view.viewingAs?.administrator, JSON.stringify(entered.body));
const V = view.token;
check("the session is the underwriter's: underwriter screens work", (await http(V, "GET", "/api/applications/pipeline")).status === 200);
check("the session is the underwriter's: admin screens do not", (await http(V, "GET", "/api/auth/admin/roles")).status === 403);
check("the session is the underwriter's own identity, not the administrator's", (await http(V, "GET", "/api/auth/validate")).body.data === (await http(uwSession.token, "GET", "/api/auth/validate")).body.data);

// ---- read-only
for (const [m, p, b] of [["POST", "/api/applications/start", { customerId: uw.id, customerEmail: "x@y.test" }], ["PUT", "/api/auth/language", { preferredLanguage: "he" }], ["POST", "/api/workflow/availability", {}], ["PUT", "/api/workflow/availability", { available: false }]]) {
  const r = await http(V, m, p, b);
  check(`read-only: ${m} ${p} is refused`, r.status === 403 && /read-only/i.test(r.body?.message ?? ""), `${r.status} ${JSON.stringify(r.body)}`);
}
check("the underwriter's own settings were not changed", (await http((await login("000000014", "DIGI")).token, "GET", "/api/auth/validate")).status === 200);

// ---- who can be viewed, and by whom
check("an admin cannot view as another administrator", (await http(admin, "POST", `/api/auth/admin/users/${adm.id}/enter-as`)).status === 403);
const nested = await http(V, "POST", `/api/auth/admin/users/${uw.id}/enter-as`);
check("no nesting: a viewing session cannot start another", nested.status === 403);
check("an unknown user is not found", (await http(admin, "POST", "/api/auth/admin/users/999999/enter-as")).status === 404);
const uwToken = (await login("000000014", "DIGI")).token;
check("a non-admin cannot start one", (await http(uwToken, "POST", `/api/auth/admin/users/${uw.id}/enter-as`)).status === 403);

// ---- across lenders
const sa = (await login("000000099")).token;
const digi = data(await http(sa, "GET", "/api/platform/lenders")).find((l) => l.code === "DIGI");
const code = `V${RUN}`, nid = `7${RUN}0000`.slice(0, 9);
await http(sa, "POST", "/api/platform/lenders", { code, name: "Other lender", cloneFromLenderId: digi.id, admin: { fullName: "Other Admin", email: `o${RUN}@t.test`, nationalId: nid } });
const adminB = (await login(nid, code)).token;
check("another lender's admin cannot view a DIGI user (not found)", (await http(adminB, "POST", `/api/auth/admin/users/${uw.id}/enter-as`)).status === 404);
// a platform admin inside DIGI can; outside any lender cannot
const insideDigi = data(await http(sa, "POST", `/api/platform/lenders/${digi.id}/enter`)).token;
const saView = await http(insideDigi, "POST", `/api/auth/admin/users/${uw.id}/enter-as`);
check("a platform admin inside a lender can view a user", saView.status === 200 && data(saView).role === "UNDERWRITER", JSON.stringify(saView.body));
const platformLevel = data(await http(sa, "POST", "/api/platform/exit")).token;
check("a platform admin outside any lender cannot", (await http(platformLevel, "POST", `/api/auth/admin/users/${uw.id}/enter-as`)).status >= 400);
const saExit = await http(data(saView).token, "POST", "/api/auth/exit-impersonation");
check("exiting returns the platform admin to the lender, not to a plain admin session", data(saExit)?.role === "SUPER_ADMIN" && data(saExit).lenderCode === "DIGI" && !data(saExit).viewingAs, JSON.stringify(saExit.body));

// ---- ending
check("exit without viewing is refused", (await http(admin, "POST", "/api/auth/exit-impersonation")).status === 400);
const out = await http(V, "POST", "/api/auth/exit-impersonation");
check("exiting gives the administrator's own session back", out.status === 200 && data(out).role === "ADMIN" && !data(out).viewingAs, JSON.stringify(out.body));
check("the restored session works for admin screens", (await http(data(out).token, "GET", "/api/auth/admin/roles")).status === 200);

// ---- logout while viewing must not log the viewed user out
const again = data(await http(admin, "POST", `/api/auth/admin/users/${uw.id}/enter-as`)).token;
await http(again, "POST", "/api/auth/logout");
check("logging out of a view does not sign the viewed user out", (await http(uwToken, "GET", "/api/applications/pipeline")).status === 200);

// ---- the administrator's own standing governs the view
const third = data(await http(admin, "POST", `/api/auth/admin/users/${uw.id}/enter-as`)).token;
check("a view works before the admin is touched", (await http(third, "GET", "/api/applications/pipeline")).status === 200);
// another admin disables the viewing admin: create one first
const mk = await http(admin, "POST", "/api/auth/admin/users", { email: `adm2${RUN}@t.test`, fullName: "Second Admin", nationalId: `6${RUN}000`.slice(0, 9), role: "ADMIN" });
const second = data(mk);
const secondTok = (await login(second.nationalId, "DIGI")).token;
const viewBySecond = data(await http(secondTok, "POST", `/api/auth/admin/users/${uw.id}/enter-as`)).token;
check("a second admin's view works", (await http(viewBySecond, "GET", "/api/applications/pipeline")).status === 200);
await http(admin, "PUT", `/api/auth/admin/users/${second.id}/enabled`, { enabled: false });
check("disabling the administrator ends their view at once", (await http(viewBySecond, "GET", "/api/applications/pipeline")).status === 401);
await http(admin, "PUT", `/api/auth/admin/users/${uw.id}/enabled`, { enabled: false });
check("disabling the viewed user ends the view too", (await http(third, "GET", "/api/applications/pipeline")).status === 401);
check("a disabled user cannot be viewed", (await http(admin, "POST", `/api/auth/admin/users/${uw.id}/enter-as`)).status === 403);
await http(admin, "PUT", `/api/auth/admin/users/${uw.id}/enabled`, { enabled: true });
check("and can be viewed again once enabled", (await http(admin, "POST", `/api/auth/admin/users/${uw.id}/enter-as`)).status === 200);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
