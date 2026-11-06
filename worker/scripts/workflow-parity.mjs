#!/usr/bin/env node
// Behaviour-parity harness for the workflow engine migration (and, later, Worker-vs-Java).
//
//   node scripts/workflow-parity.mjs setup --cwd <worker dir> --persist <state dir>
//   node scripts/workflow-parity.mjs run   --base http://127.0.0.1:8788 --cwd <worker dir> --persist <state dir> --log <wrangler log> --out dump.json
//   node scripts/workflow-parity.mjs diff  old.json new.json
//
// `run` drives the same scenarios through the public HTTP API as customer / underwriter / senior /
// banker, then dumps what each scenario left behind: final application fields, notes, customer
// notifications (title + full text), audit events, referral rows and attempted emails (event keys,
// read from the worker log). Application refs are replaced by scenario labels so two runs compare.
// `diff` prints every difference. Differences in the "negative" scenarios are the deliberate
// corrections listed in workflow-spec/CORRECTIONS.md; anything else is a regression.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const cmd = args.shift();
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

function wrangler(cwd, persist, wargs) {
  const r = spawnSync("npx", ["wrangler", ...wargs, "--local", "--persist-to", persist], { cwd, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`wrangler ${wargs.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}
function sql(cwd, persist, command) {
  const out = wrangler(cwd, persist, ["d1", "execute", "digibank", "--json", "--command", JSON.stringify(command)]);
  const parsed = JSON.parse(out.slice(out.indexOf("[")));
  return parsed.flatMap((p) => p.results ?? []);
}

// ------------------------------------------------------------------ setup
if (cmd === "setup") {
  const cwd = opt("cwd"), persist = opt("persist");
  wrangler(cwd, persist, ["d1", "migrations", "apply", "digibank"]);
  for (const f of ["seed.sql", "seed-form-versions.sql", "scripts/seed-org-structure.sql"]) {
    wrangler(cwd, persist, ["d1", "execute", "digibank", "--file", f]);
  }
  const inserts = [];
  for (let i = 1; i <= 40; i++) {
    const n = String(300 + i).padStart(9, "0");
    inserts.push(`INSERT INTO users (uuid, email, national_id, id_issue_date, full_name, role, created_at, enabled, email_verified, otp_attempts) SELECT lower(hex(randomblob(16))), 'parity${i}@example.com', '${n}', '2015-01-01', 'Parity Customer ${i}', 'CUSTOMER', '2026-11-06T00:00:00.000Z', 1, 1, 0 WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'parity${i}@example.com')`);
  }
  for (const s of inserts) sql(cwd, persist, s);
  // A fresh database has no email templates (the admin page creates them lazily), so seed one per
  // event, enabled: every transition's email attempt then shows up in the worker log.
  for (const ev of ["SUBMITTED", "DOCUMENT_REQUEST", "CLARIFICATION_REQUEST", "DECISION_APPROVED", "DECISION_DECLINED", "SEND_BACK", "DISBURSEMENT_AUTHORISED"]) {
    sql(cwd, persist, `INSERT INTO email_templates (event_key, enabled, subject, body_content) SELECT '${ev}', 1, 'Parity ${ev}', 'Body' WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE event_key = '${ev}')`);
  }
  sql(cwd, persist, "UPDATE email_templates SET enabled = 1");
  // Role-default mandates, if the migration ran before the seed (fresh database) and so copied nothing.
  for (const [role, max] of [["UNDERWRITER", 100000], ["SENIOR_UNDERWRITER", 300000], ["HEAD_OF_LENDING", 750000], ["COO", 2000000], ["CEO", 999999999]]) {
    sql(cwd, persist, `INSERT INTO mandates (role_code, org_unit_id, application_type, max_amount) SELECT '${role}', NULL, NULL, ${max} WHERE NOT EXISTS (SELECT 1 FROM mandates WHERE role_code = '${role}' AND org_unit_id IS NULL AND application_type IS NULL)`);
  }
  console.log("setup done");
  process.exit(0);
}

// ------------------------------------------------------------------ diff
if (cmd === "diff") {
  const a = JSON.parse(readFileSync(args[0], "utf8")), b = JSON.parse(readFileSync(args[1], "utf8"));
  let n = 0;
  const walk = (x, y, path) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x) && !Array.isArray(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${path}.${k}`);
    } else if (Array.isArray(x) && Array.isArray(y) && x.length === y.length) {
      x.forEach((v, i) => walk(v, y[i], `${path}[${i}]`));
    } else { n++; console.log(`${path}\n    old: ${JSON.stringify(x)}\n    new: ${JSON.stringify(y)}`); }
  };
  walk(a.scenarios, b.scenarios, "scenarios");
  walk(a.emails, b.emails, "emails");
  walk(a.queues, b.queues, "queues");
  console.log(n ? `\n${n} difference(s)` : "IDENTICAL");
  process.exit(0);
}

// ------------------------------------------------------------------ run
if (cmd !== "run") { console.error("usage: setup | run | diff"); process.exit(2); }
const BASE = opt("base"), CWD = opt("cwd"), PERSIST = opt("persist"), LOG = opt("log"), OUT = opt("out");

async function http(token, method, path, body) {
  // The synchronous wrangler calls between requests let the server drop idle keep-alive sockets;
  // a reused dead socket surfaces as ECONNRESET, so retry (and ask for a fresh connection).
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
async function login(nationalId) {
  const o = await http(null, "POST", "/api/auth/login/request-otp", { nationalId });
  const v = await http(null, "POST", "/api/auth/login/verify-otp", { nationalId, otp: o.body.data.demoOtp });
  return v.body.data.token;
}
// jwt "issued at" is whole seconds and sessions are revoked by timestamp, so a fresh login right
// after a revoke can race; staff logins here happen once, up front.
const staff = { uw: await login("000000014"), sr: await login("000000205"), ceo: await login("000000208"), banker: await login("000000027") };
const FIELDS = ["status", "disbursementStatus", "referredToRole", "approvedAmount", "guarantorRequired", "currentSection", "autoApproved"];
const summarise = (r) => (r.status >= 200 && r.status < 300 && r.body && typeof r.body === "object" ? { http: r.status, ...Object.fromEntries(FIELDS.filter((f) => f in r.body).map((f) => [f, r.body[f] ?? null])) } : { http: r.status });

// Start from a clean slate: drop everything earlier runs left behind for the parity customers.
const parityApps = "SELECT application_ref FROM loan_applications WHERE customer_email LIKE 'parity%@example.com'";
for (const q of [
  `DELETE FROM underwriting_notes WHERE application_ref IN (${parityApps})`,
  `DELETE FROM notifications WHERE application_ref IN (${parityApps})`,
  `DELETE FROM audit_log WHERE subject_id IN (${parityApps})`,
  `DELETE FROM case_referrals WHERE application_ref IN (${parityApps})`,
  `DELETE FROM wf_transitions WHERE application_ref IN (${parityApps})`,
  `DELETE FROM wf_case_tracks WHERE application_ref IN (${parityApps})`,
  `DELETE FROM wf_cases WHERE application_ref IN (${parityApps})`,
  "DELETE FROM loan_applications WHERE customer_email LIKE 'parity%@example.com'",
]) { try { sql(CWD, PERSIST, q); } catch (e) { if (!/no such table/i.test(String(e.message))) throw e; } }

const custRows = sql(CWD, PERSIST, "SELECT id, national_id, email FROM users WHERE email LIKE 'parity%@example.com' ORDER BY id");
const cust = custRows.map((c) => ({ id: c.id, email: c.email, nid: c.national_id }));
const scenarios = {};
const refByLabel = {};
let custIx = 0;
const PRODUCT = { productId: "PARITY-1", productName: "Parity Loan", interestRate: 5.5, termMonths: 36, monthlyRepayment: 900 };

async function scenario(label, fn) {
  const c = cust[custIx++];
  const token = await login(c.nid);
  const steps = [];
  const ctx = { label, token, cust: c, ref: null, other: cust[custIx % cust.length] };
  ctx.step = async (name, tokenOrKey, method, path, body) => {
    const t = tokenOrKey === "cust" ? token : (staff[tokenOrKey] ?? tokenOrKey);
    const r = await http(t, method, path.replace(":ref", ctx.ref), body);
    steps.push({ name, ...summarise(r) });
    return r;
  };
  ctx.start = async () => {
    const r = await http(token, "POST", "/api/applications/start", { customerId: c.id, customerEmail: c.email });
    ctx.ref = r.body.applicationRef; refByLabel[label] = ctx.ref;
    steps.push({ name: "start", ...summarise(r) });
  };
  ctx.toUnderReview = async () => { await ctx.step("submit", "cust", "POST", "/api/applications/:ref/submit"); await ctx.step("select-product", "cust", "POST", "/api/applications/:ref/select-product", PRODUCT); };
  await ctx.start();
  await fn(ctx);
  scenarios[label] = { steps };
}
const A = "/api/applications/:ref";

await scenario("approve-flow", async (s) => { await s.toUnderReview(); await s.step("approve", "uw", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 50000 }); await s.step("second-check", "uw", "POST", `${A}/disbursement/second-check`, {}); await s.step("authorise", "uw", "POST", `${A}/disbursement/authorise`, {}); });
await scenario("decline", async (s) => { await s.toUnderReview(); await s.step("decline", "uw", "POST", `${A}/decline`, { reason: "Income too low" }); });
await scenario("send-back-guarantor", async (s) => { await s.toUnderReview(); await s.step("send-back", "uw", "POST", `${A}/send-back`, { reason: "Need a guarantor", requireGuarantor: "true" }); });
await scenario("send-back-plain", async (s) => { await s.toUnderReview(); await s.step("send-back", "uw", "POST", `${A}/send-back`, { reason: "Clarify income", requireGuarantor: "false" }); });
await scenario("refer-then-senior-approves", async (s) => { await s.toUnderReview(); await s.step("refer", "uw", "POST", `${A}/refer-to-senior`, { reason: "Over my limit" }); await s.step("referrer-approve-locked", "uw", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 1000 }); await s.step("senior-approve", "sr", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 150000 }); });
await scenario("refer-over-mandate", async (s) => { await s.toUnderReview(); await s.step("refer", "uw", "POST", `${A}/refer-to-senior`, { reason: "x" }); await s.step("senior-over-mandate", "sr", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 400000 }); await s.step("ceo-approve", "ceo", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 400000 }); });
await scenario("conditional-then-approve", async (s) => { await s.toUnderReview(); await s.step("approve-conditional", "uw", "POST", `${A}/approve`, {}); await s.step("approve", "uw", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 40000 }); });
await scenario("withdraw-and-resubmit", async (s) => { await s.step("submit", "cust", "POST", `${A}/submit`); await s.step("withdraw", "cust", "POST", `${A}/withdraw`); await s.step("resubmit", "cust", "POST", `${A}/submit`); });
await scenario("cancel-referred", async (s) => { await s.toUnderReview(); await s.step("refer", "uw", "POST", `${A}/refer-to-senior`, { reason: "x" }); await s.step("cancel", "cust", "POST", `${A}/cancel`); });
await scenario("cancel-draft", async (s) => { await s.step("cancel", "cust", "POST", `${A}/cancel`); });
await scenario("notes", async (s) => { await s.toUnderReview(); await s.step("note", "uw", "POST", `${A}/notes`, { section: "general", note: "Called the employer", noteType: "NOTE" }); await s.step("clarification", "uw", "POST", `${A}/notes`, { section: "incomeEmployment", note: "Please explain the gap", noteType: "CLARIFICATION_REQUEST" }); await s.step("document-request", "uw", "POST", `${A}/notes`, { section: "documents", note: "Latest payslip", noteType: "DOCUMENT_REQUEST" }); await s.step("banker-note", "banker", "POST", `${A}/notes`, { section: "general", note: "Customer called" }); });
await scenario("auto-approve", async (s) => {
  sql(CWD, PERSIST, `UPDATE loan_applications SET loan_requirements_json = '{"loanAmount":20000,"loanPurpose":"Home Improvement","loanTerm":36,"numberOfApplicants":1}', affordability_result_json = '{"passed":true}' WHERE application_ref = '${s.ref}'`);
  await s.toUnderReview();
});
const LOAN = (amount) => ({ section: "loanRequirements", data: { loanAmount: amount, loanPurpose: "Home Improvement", loanTerm: 36, numberOfApplicants: 1 } });
await scenario("wizard-save-and-staff-edit", async (s) => { await s.step("save-section", "cust", "PUT", `${A}/section`, LOAN(20000)); await s.toUnderReview(); await s.step("staff-edit", "uw", "PUT", `${A}/section-by-underwriter`, LOAN(25000)); });
await scenario("banker-assisted-save", async (s) => { await s.step("banker-saves-section", "banker", "PUT", `${A}/section`, LOAN(30000)); });
await scenario("authorise-direct", async (s) => { await s.toUnderReview(); await s.step("approve", "uw", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 10000 }); await s.step("authorise", "uw", "POST", `${A}/disbursement/authorise`, {}); });

// ---- negative probes: differences here are the deliberate corrections (workflow-spec/CORRECTIONS.md)
await scenario("neg-decline-draft", async (s) => { await s.step("decline", "uw", "POST", `${A}/decline`, { reason: "x" }); });
await scenario("neg-approve-declined", async (s) => { await s.toUnderReview(); await s.step("decline", "uw", "POST", `${A}/decline`, { reason: "x" }); await s.step("approve", "uw", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 1000 }); });
await scenario("neg-authorise-unapproved", async (s) => { await s.toUnderReview(); await s.step("authorise", "uw", "POST", `${A}/disbursement/authorise`, {}); });
await scenario("neg-submit-twice", async (s) => { await s.step("submit", "cust", "POST", `${A}/submit`); await s.step("submit-again", "cust", "POST", `${A}/submit`); });
await scenario("neg-cancel-approved", async (s) => { await s.toUnderReview(); await s.step("approve", "uw", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 1000 }); await s.step("cancel", "cust", "POST", `${A}/cancel`); });
await scenario("neg-decline-no-reason", async (s) => { await s.toUnderReview(); await s.step("decline", "uw", "POST", `${A}/decline`, { reason: "" }); });
await scenario("neg-withdraw-approved", async (s) => { await s.toUnderReview(); await s.step("approve", "uw", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 1000 }); await s.step("withdraw", "cust", "POST", `${A}/withdraw`); });
await scenario("neg-banker-approve", async (s) => { await s.toUnderReview(); await s.step("approve-by-banker", "banker", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 1000 }); await s.step("conditional-by-banker", "banker", "POST", `${A}/approve`, {}); await s.step("decline-by-banker", "banker", "POST", `${A}/decline`, { reason: "x" }); });
await scenario("neg-other-customer-cancels", async (s) => { const other = await login(s.other.nid); await s.step("cancel-by-other", other, "POST", `${A}/cancel`); });
await scenario("neg-underwriter-saves-as-customer", async (s) => { await s.step("uw-saves-section", "uw", "PUT", `${A}/section`, LOAN(20000)); });
await scenario("neg-save-after-submit", async (s) => { await s.step("submit", "cust", "POST", `${A}/submit`); await s.step("save-after-submit", "cust", "PUT", `${A}/section`, LOAN(20000)); });
await scenario("neg-over-mandate", async (s) => { await s.toUnderReview(); await s.step("approve-over-limit", "uw", "POST", `${A}/approve-by-underwriter`, { approvedAmount: 250000 }); });

// ------------------------------------------------------------------ dump
const labelOf = Object.fromEntries(Object.entries(refByLabel).map(([l, r]) => [r, l]));
const refs = Object.values(refByLabel).map((r) => `'${r}'`).join(",");
const norm = (v) => (typeof v === "string" ? v.replace(/DGB-\d{4}-\d+/g, (m) => labelOf[m] ?? m) : v);
const rows = (q) => sql(CWD, PERSIST, q);
const final = rows(`SELECT application_ref r, status, disbursement_status, referred_to_role, approved_amount, guarantor_required, current_section, auto_approved, completion_percentage, form_version_id IS NOT NULL AS form_pinned, submitted_at IS NOT NULL AS submitted FROM loan_applications WHERE application_ref IN (${refs})`);
const notes = rows(`SELECT application_ref r, section, note_type, note, created_by FROM underwriting_notes WHERE application_ref IN (${refs}) ORDER BY id`);
const notifs = rows(`SELECT application_ref r, title, type, message FROM notifications WHERE application_ref IN (${refs}) ORDER BY id`);
const audit = rows(`SELECT subject_id r, event_type, actor, detail FROM audit_log WHERE subject_id IN (${refs}) ORDER BY id`);
const refs2 = rows(`SELECT application_ref r, from_role, to_role, reason, resolved_at IS NOT NULL AS resolved FROM case_referrals WHERE application_ref IN (${refs}) ORDER BY id`);
for (const [label, ref] of Object.entries(refByLabel)) {
  const pick = (arr, drop = ["r"]) => arr.filter((x) => x.r === ref || x.r === ref).map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !drop.includes(k)).map(([k, v]) => [k, norm(v)])));
  const f = pick(final)[0] ?? {};
  scenarios[label].final = f;
  scenarios[label].notes = pick(notes);
  scenarios[label].notifications = pick(notifs);
  scenarios[label].audit = pick(audit);
  scenarios[label].referrals = pick(refs2);
}
// What each staff role sees from each queue endpoint (only the labelled parity cases; anything
// else in the database is counted, not listed, so seed data cannot cause false differences).
const queues = {};
for (const role of ["uw", "sr", "ceo", "banker"]) {
  queues[role] = {};
  for (const ep of ["pipeline", "banker-queue", "home-stats", "staff-activity"]) {
    const r = await http(staff[role], "GET", `/api/applications/${ep}`);
    if (r.status !== 200) { queues[role][ep] = { http: r.status }; continue; }
    const refOf = (x) => x.applicationRef;
    const labelled = r.body.filter((x) => labelOf[refOf(x)]);
    queues[role][ep] = {
      http: 200,
      cases: [...new Set(labelled.map((x) => `${labelOf[refOf(x)]}:${x.applicationStatus ?? x.status}${x.noteType ? "/" + x.noteType : ""}`))].sort(),
    };
  }
}
await new Promise((r) => setTimeout(r, 1500)); // let waitUntil() email attempts reach the log
const emails = {};
if (LOG) {
  for (const line of readFileSync(LOG, "utf8").split(/\r?\n/)) {
    if (!line.includes("sendTemplatedEmail:")) continue;
    try {
      const j = JSON.parse(line.slice(line.indexOf("{"), line.lastIndexOf("}") + 1)); // wrangler adds colour codes around the line
      const label = labelOf[j.appRef]; if (!label) continue;
      (emails[label] ??= []).push(j.eventKey);
    } catch { /* not a JSON log line */ }
  }
}
for (const k of Object.keys(emails)) emails[k].sort();
writeFileSync(OUT, JSON.stringify({ scenarios, emails, queues }, null, 2));
console.log(`wrote ${OUT}: ${Object.keys(scenarios).length} scenarios`);
