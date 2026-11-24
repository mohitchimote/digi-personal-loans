#!/usr/bin/env node
// Writes the SQL that purges test cases from a UAT database, keeping only the applications listed:
//   node scripts/uat-purge.mjs --keep scripts/uat-keep.proposed.txt > purge.sql
// It only prints; nothing is executed. Review the keep list and the SQL, run it on a COPY first
// (wrangler d1 execute digibank --local --file purge.sql), and only then on the real database.
// Run it AFTER the migrations (every table must exist). It touches lender 1 (DIGI) only.
//
// Deleted: every application not listed, with its notes, documents, product selections, referrals,
// workflow rows, issued letters, notifications and audit rows about it; then every customer
// (CUSTOMER / BUSINESS_OWNER) with no application left, with their notifications and document rows.
// Kept: staff and admin users, all configuration, the listed applications and their customers.
// Files in storage (R2) are NOT deleted by this: list their keys first with the query printed at the top.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const keepFile = args[args.indexOf("--keep") + 1];
if (!keepFile) { console.error("usage: node scripts/uat-purge.mjs --keep <file with one application reference per line>"); process.exit(1); }
const refs = readFileSync(keepFile, "utf8").split(/\s+/).filter(Boolean);
for (const r of refs) if (!/^DGB-\d{4}-\d+$/.test(r)) { console.error(`not an application reference: ${r}`); process.exit(1); }
if (refs.length === 0) { console.error("the keep list is empty; refusing to purge every application"); process.exit(1); }
const KEEP = refs.map((r) => `'${r}'`).join(", ");
const gone = `application_ref NOT IN (${KEEP})`;
const noApp = `customer_id NOT IN (SELECT customer_id FROM loan_applications)`;

console.log(`-- UAT purge: keeps ${refs.length} applications (${refs.join(", ")}).
-- BEFORE running, list the stored files that will be orphaned, to delete from R2 afterwards:
--   SELECT file_path AS key FROM generated_documents WHERE ${gone}
--   UNION SELECT storage_path FROM uploaded_documents WHERE ${gone};
`);
const stmts = [
  `DELETE FROM underwriting_notes WHERE lender_id = 1 AND ${gone}`,
  `DELETE FROM generated_documents WHERE lender_id = 1 AND ${gone}`,
  `DELETE FROM uploaded_documents WHERE lender_id = 1 AND ${gone}`,
  `DELETE FROM product_selections WHERE lender_id = 1 AND ${gone}`,
  `DELETE FROM case_referrals WHERE lender_id = 1 AND ${gone}`,
  `DELETE FROM wf_transitions WHERE lender_id = 1 AND ${gone}`,
  `DELETE FROM wf_case_tracks WHERE lender_id = 1 AND ${gone}`,
  `DELETE FROM wf_cases WHERE lender_id = 1 AND ${gone}`,
  `DELETE FROM letters_issued WHERE lender_id = 1 AND ${gone}`,
  `DELETE FROM notifications WHERE lender_id = 1 AND application_ref IS NOT NULL AND ${gone}`,
  `DELETE FROM audit_log WHERE lender_id = 1 AND subject_type = 'LoanApplication' AND subject_id NOT IN (${KEEP})`,
  `DELETE FROM loan_applications WHERE lender_id = 1 AND ${gone}`,
  // customers left with no application
  `DELETE FROM notifications WHERE lender_id = 1 AND ${noApp}`,
  `DELETE FROM generated_documents WHERE lender_id = 1 AND ${noApp}`,
  `DELETE FROM uploaded_documents WHERE lender_id = 1 AND ${noApp}`,
  `DELETE FROM users WHERE lender_id = 1 AND role IN ('CUSTOMER', 'BUSINESS_OWNER') AND id NOT IN (SELECT customer_id FROM loan_applications)`,
];
for (const s of stmts) console.log(s + ";");
