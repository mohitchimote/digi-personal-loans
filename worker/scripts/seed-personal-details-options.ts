/**
 * Seeds admin-editable `options` + a preferredBranch -> staffName cascading `optionsDependOn` map
 * onto personal-loan-wizard's maritalStatus/nationality/preferredBranch/staffName fields (see the
 * architecture-review plan this came out of: option codes are private per field, and a cascading
 * "this field's options depend on another field's value" case gets a picker-driven map — never a
 * shared cross-field registry, never the general AND/OR condition engine).
 *
 * maritalStatus/nationality labels are pulled verbatim from frontend/src/app/core/i18n/en.ts and
 * he.ts's existing "maritalStatus.X" / "nationality.X" keys — never invented, per this project's
 * own "don't invent form copy" rule. preferredBranch/staffName currently render completely
 * untranslated (DIGIBANK_BRANCHES/DIGIBANK_BRANCH_STAFF in core/models/index.ts), so both are
 * seeded with label.en === label.he === today's exact display string — a zero-visible-diff start.
 *
 * Codes are deliberately clean and deliberate, not copies of today's raw strings — safe to do now
 * since every application in the system today is test data (no frozen historical form_version to
 * keep matching); see the plan for why this is the one window to do that.
 *
 * This produces a new DRAFT only. It never touches the currently PUBLISHED row and never
 * publishes anything itself — a human reviews the draft in the Admin Form Builder and publishes
 * it explicitly, per this feature's standing "treat schema changes as live production changes"
 * rule.
 *
 * Usage (two steps, since this needs to read the *currently published* schema — which may have
 * drifted from the original day-one seed via admin edits — before writing a new draft on top of
 * it):
 *
 *   1) Dump every existing personal-loan-wizard row (need all of them, not just the published one,
 *      to compute the next version number correctly):
 *        npx wrangler d1 execute digibank --local --json \
 *          --command "SELECT id, version, status, schema_json FROM form_versions WHERE form_key='personal-loan-wizard'" \
 *          > /tmp/personal-loan-wizard-versions.json
 *      (repeat with --remote once verified locally)
 *
 *   2) Generate the new draft's INSERT:
 *        npx tsx scripts/seed-personal-details-options.ts /tmp/personal-loan-wizard-versions.json > seed-personal-details-options.sql
 *
 *   3) Apply it:
 *        npx wrangler d1 execute digibank --local  --file=./seed-personal-details-options.sql
 *        npx wrangler d1 execute digibank --remote --file=./seed-personal-details-options.sql
 *
 *   4) Open the new draft in the Admin Form Builder, review it, then publish by hand.
 */

import { readFileSync } from "node:fs";
import type { FormVersionSchema, FormField, FieldOption } from "../src/lib/form-schema-types";

function sqlStr(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

function opt(value: string, en: string, he: string): FieldOption {
  return { value, label: { en, he } };
}

// Verbatim from frontend/src/app/core/i18n/en.ts / he.ts's maritalStatus.*/nationality.* keys.
const MARITAL_STATUS_OPTIONS: FieldOption[] = [
  opt("single", "Single", "רווק/ה"),
  opt("married", "Married", "נשוי/אה"),
  opt("divorced", "Divorced", "גרוש/ה"),
  opt("widowed", "Widowed", "אלמן/ה"),
  opt("civilPartnership", "Civil Partnership", "ידוע/ה בציבור"),
  opt("separated", "Separated", "פרוד/ה"),
];

const NATIONALITY_OPTIONS: FieldOption[] = [
  opt("IL", "Israeli", "ישראלי/ת"),
  opt("US", "American", "אמריקאי/ת"),
  opt("GB", "British", "בריטי/ת"),
  opt("FR", "French", "צרפתי/ת"),
  opt("DE", "German", "גרמני/ת"),
  opt("RU", "Russian", "רוסי/ת"),
  opt("ET", "Ethiopian", "אתיופי/ת"),
  opt("IN", "Indian", "הודי/ת"),
  opt("OTHER", "Other", "אחר"),
];

// Sourced directly from DIGIBANK_BRANCHES/DIGIBANK_BRANCH_STAFF (frontend/src/app/core/models/
// index.ts) so all six branches' rosters carry over exactly. branchName/staff names double as
// both label.en and label.he since they render untranslated today.
const BRANCH_STAFF: { branchCode: string; branchName: string; staff: { code: string; name: string }[] }[] = [
  {
    branchCode: "TLV_ROTHSCHILD", branchName: "Tel Aviv - Rothschild Blvd",
    staff: [
      { code: "TLV_YAEL_COHEN", name: "Yael Cohen" },
      { code: "TLV_ITAI_MOR", name: "Itai Mor" },
      { code: "TLV_SHIRA_BEN_ARI", name: "Shira Ben-Ari" },
      { code: "TLV_OMER_KATZ", name: "Omer Katz" },
    ],
  },
  {
    branchCode: "JLM_JAFFA", branchName: "Jerusalem - Jaffa Road",
    staff: [
      { code: "JLM_AVI_STEINBERG", name: "Avi Steinberg" },
      { code: "JLM_NOA_FRIEDMAN", name: "Noa Friedman" },
      { code: "JLM_EITAN_AZULAY", name: "Eitan Azulay" },
    ],
  },
  {
    branchCode: "HAIFA_HADAR", branchName: "Haifa - Hadar",
    staff: [
      { code: "HAIFA_LIAT_PERETZ", name: "Liat Peretz" },
      { code: "HAIFA_RONEN_ASAF", name: "Ronen Asaf" },
      { code: "HAIFA_DANA_SHAPIRO", name: "Dana Shapiro" },
      { code: "HAIFA_GIL_BARON", name: "Gil Bar-On" },
    ],
  },
  {
    branchCode: "BEER_SHEVA_OLD_CITY", branchName: "Beer Sheva - Old City",
    staff: [
      { code: "BEERSHEVA_MAYA_SASSON", name: "Maya Sasson" },
      { code: "BEERSHEVA_TOMER_HALEVI", name: "Tomer Halevi" },
      { code: "BEERSHEVA_ADI_MALKA", name: "Adi Malka" },
    ],
  },
  {
    branchCode: "NETANYA_CENTER", branchName: "Netanya - City Center",
    staff: [
      { code: "NETANYA_YOSSI_AMAR", name: "Yossi Amar" },
      { code: "NETANYA_KEREN_TZUR", name: "Keren Tzur" },
      { code: "NETANYA_NADAV_ELIYAHU", name: "Nadav Eliyahu" },
      { code: "NETANYA_SIGAL_DOTAN", name: "Sigal Dotan" },
    ],
  },
  {
    branchCode: "EILAT_TOURIST", branchName: "Eilat - Tourist Center",
    staff: [
      { code: "EILAT_RONI_VAKNIN", name: "Roni Vaknin" },
      { code: "EILAT_EYAL_BARKAN", name: "Eyal Barkan" },
      { code: "EILAT_HILA_MAROM", name: "Hila Marom" },
    ],
  },
];

const BRANCH_OPTIONS: FieldOption[] = BRANCH_STAFF.map((b) => opt(b.branchCode, b.branchName, b.branchName));
const STAFF_OPTIONS: FieldOption[] = BRANCH_STAFF.flatMap((b) => b.staff.map((s) => opt(s.code, s.name, s.name)));
const STAFF_DEPENDS_ON_MAP: Record<string, string[]> = Object.fromEntries(
  BRANCH_STAFF.map((b) => [b.branchCode, b.staff.map((s) => s.code)])
);

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error("Usage: npx tsx scripts/seed-personal-details-options.ts <form_versions-dump.json>");
  console.error(
    'Dump it first with: wrangler d1 execute digibank --local --json --command ' +
      '"SELECT id, version, status, schema_json FROM form_versions WHERE form_key=\'personal-loan-wizard\'"'
  );
  process.exit(1);
}

// wrangler d1 execute --json wraps query output as [{ results: [...], success, meta }].
const raw = JSON.parse(readFileSync(sourcePath, "utf-8"));
const rows: { id: number; version: number; status: string; schema_json: string }[] = raw[0]?.results ?? [];
if (!rows.length) {
  console.error(`No form_versions rows for personal-loan-wizard found in ${sourcePath}`);
  process.exit(1);
}

const publishedRow = rows.find((r) => r.status === "PUBLISHED");
if (!publishedRow) {
  console.error("No PUBLISHED personal-loan-wizard row — nothing to base the new draft on.");
  process.exit(1);
}

// Next version must be unique across every row (draft/published/archived), not just published+1 —
// mirrors form-versions.ts's own createDraftFrom (version = max(existing)+1).
const nextVersion = Math.max(...rows.map((r) => r.version)) + 1;

const schema: FormVersionSchema = JSON.parse(publishedRow.schema_json);
const personalDetails = schema.sections.find((s) => s.key === "personalDetails");
if (!personalDetails) {
  console.error("personalDetails section not found in the published schema — aborting.");
  process.exit(1);
}

function setOptions(key: string, options: FieldOption[]): FormField {
  const field = personalDetails!.fields.find((f) => f.key === key);
  if (!field) {
    console.error(`Field '${key}' not found in personalDetails — aborting.`);
    process.exit(1);
  }
  field.options = options;
  return field;
}

setOptions("maritalStatus", MARITAL_STATUS_OPTIONS);
setOptions("nationality", NATIONALITY_OPTIONS);
setOptions("preferredBranch", BRANCH_OPTIONS);
const staffField = setOptions("staffName", STAFF_OPTIONS);
staffField.optionsDependOn = { fieldKey: "preferredBranch", map: STAFF_DEPENDS_ON_MAP };

const now = new Date().toISOString();
const schemaJson = JSON.stringify(schema);

const sql = `INSERT INTO form_versions (form_key, version, status, schema_json, change_note, created_at, created_by, published_at, published_by)
VALUES ('personal-loan-wizard', ${nextVersion}, 'DRAFT', ${sqlStr(schemaJson)}, 'Seed admin-editable options + preferredBranch->staffName mapping for maritalStatus/nationality/preferredBranch/staffName.', ${sqlStr(now)}, 'seed-script', NULL, NULL);`;

console.log(sql);
