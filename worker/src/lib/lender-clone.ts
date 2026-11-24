import { sql } from "drizzle-orm";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "../db/client";
import {
  affordabilityRules, brandingSettings, emailTemplates, faqs, formVersions, lenderSettings, letterImages, letterSavedRules, letterTemplates,
  letterVersions, loanProducts, mandates, masterItems, masterTypes, orgLevels, orgUnits, roleEntitlements, roles, wfDefinitions,
} from "../db/schema";

// Cloning a lender (super admin): copies CONFIGURATION only, never customers, cases, documents,
// notifications or pre-approved offers. Everything is INSERT ... SELECT inside one D1 batch (a single
// transaction), so a failure leaves nothing behind, and no row data passes through the Worker.
// Rows that point at other rows by id are re-keyed through a natural key that is unique per lender
// (org unit code, level name, master item code, ...), so the copy never points back at the source.
// This module is platform-level: it reads one lender and writes another, so the lender-isolation
// test exempts it.

/** Master types with more items than this are copied without their items (cities: ~150k rows would
 * exceed D1's daily write allowance); the reference data is loaded for the new lender separately. */
export const MAX_CLONED_MASTER_ITEMS = 5000;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

interface CopyOpts {
  /** Extra condition on the source row, alias `s`. */
  where?: string;
  /** Column (database name) -> SQL expression (may use alias `s`) replacing the copied value. */
  set?: Record<string, string>;
}

/** INSERT ... SELECT of every column of `table` from the source lender into the new one. A generated
 * primary key (`id`) is left for the database to assign unless an expression is given for it. */
function copy(table: SQLiteTable, src: number, dstExpr: string, o: CopyOpts = {}): string {
  const cols = getTableConfig(table).columns.filter((c) => !(c.primary && !o.set?.[c.name]));
  const names = cols.map((c) => `"${c.name}"`).join(", ");
  const exprs = cols.map((c) => (c.name === "lender_id" ? dstExpr : (o.set?.[c.name] ?? `s."${c.name}"`))).join(", ");
  const t = getTableConfig(table).name;
  return `INSERT INTO "${t}" (${names}) SELECT ${exprs} FROM "${t}" AS s WHERE s."lender_id" = ${src}${o.where ? ` AND ${o.where}` : ""}`;
}

export interface CloneFacts {
  /** Distinct org level depths in use, shallowest first. */
  unitDepths: number[];
  /** Master types in parent-before-child order, with their item counts. */
  masterTypes: { code: string; parentTypeCode: string | null; items: number }[];
  /** Ids of the source lender's letter pictures. */
  imageIds: string[];
}

/** What has to be known before the statements can be written (small queries on the source lender). */
export async function loadCloneFacts(db: Db, src: number): Promise<CloneFacts> {
  const depthRows = await db.all<{ depth: number }>(sql`SELECT DISTINCT l.depth AS depth FROM org_units u JOIN org_levels l ON l.id = u.level_id WHERE u.lender_id = ${src} ORDER BY l.depth`);
  const types = await db.all<{ code: string; parent: string | null }>(sql`SELECT code, parent_type_code AS parent FROM master_types WHERE lender_id = ${src}`);
  const counts = await db.all<{ code: string; n: number }>(sql`SELECT type_code AS code, COUNT(*) AS n FROM master_items WHERE lender_id = ${src} GROUP BY type_code`);
  const n = new Map(counts.map((c) => [c.code, Number(c.n)]));
  const byCode = new Map(types.map((t) => [t.code, t]));
  const depthOf = (code: string, seen = new Set<string>()): number => {
    const p = byCode.get(code)?.parent;
    if (!p || seen.has(code)) return 0;
    seen.add(code);
    return 1 + depthOf(p, seen);
  };
  const ordered = types
    .map((t) => ({ code: t.code, parentTypeCode: t.parent, items: n.get(t.code) ?? 0, depth: depthOf(t.code) }))
    .sort((a, b) => a.depth - b.depth || a.code.localeCompare(b.code));
  const images = await db.all<{ id: string }>(sql`SELECT id FROM letter_images WHERE lender_id = ${src}`);
  return { unitDepths: depthRows.map((d) => Number(d.depth)), masterTypes: ordered.map(({ depth: _d, ...t }) => t), imageIds: images.map((i) => i.id) };
}

export interface CloneSummary { mastersWithoutItems: string[] }

/** The SQL statements, in dependency order. `dstCode` identifies the new lender row, which the batch
 * itself creates first, so its id is read back with a sub-select. */
export function buildCloneStatements(src: number, dstCode: string, facts: CloneFacts): { statements: string[]; summary: CloneSummary } {
  const dst = `(SELECT id FROM "lenders" WHERE code = ${q(dstCode)})`;
  const out: string[] = [];

  // Roles and what they may do.
  out.push(copy(roles, src, dst));
  out.push(copy(roleEntitlements, src, dst));

  // Masters: types first, then items type by type (parents before children), each item's parent
  // re-keyed by (type, code). Oversized types keep their definition but not their items; so do
  // their children, which would have no parent to hang under.
  out.push(copy(masterTypes, src, dst));
  const skipped = new Set<string>();
  for (const t of facts.masterTypes) {
    if (t.items > MAX_CLONED_MASTER_ITEMS || (t.parentTypeCode && skipped.has(t.parentTypeCode))) { if (t.items > 0) skipped.add(t.code); continue; }
    out.push(copy(masterItems, src, dst, {
      where: `s."type_code" = ${q(t.code)}`,
      set: {
        parent_id: `(SELECT np.id FROM "master_items" np WHERE np."lender_id" = ${dst} AND np."type_code" = (SELECT p."type_code" FROM "master_items" p WHERE p.id = s."parent_id") AND np."code" = (SELECT p."code" FROM "master_items" p WHERE p.id = s."parent_id"))`,
      },
    }));
  }

  // Organisation: levels (unique by name), then units level by level so a parent exists before its children.
  out.push(copy(orgLevels, src, dst));
  for (const depth of facts.unitDepths) {
    out.push(copy(orgUnits, src, dst, {
      where: `(SELECT l.depth FROM "org_levels" l WHERE l.id = s."level_id") = ${depth}`,
      set: {
        level_id: `(SELECT nl.id FROM "org_levels" nl WHERE nl."lender_id" = ${dst} AND nl."name" = (SELECT l."name" FROM "org_levels" l WHERE l.id = s."level_id"))`,
        parent_id: `(SELECT np.id FROM "org_units" np WHERE np."lender_id" = ${dst} AND np."code" = (SELECT p."code" FROM "org_units" p WHERE p.id = s."parent_id"))`,
      },
    }));
  }
  out.push(copy(mandates, src, dst, {
    set: { org_unit_id: `(SELECT nu.id FROM "org_units" nu WHERE nu."lender_id" = ${dst} AND nu."code" = (SELECT u."code" FROM "org_units" u WHERE u.id = s."org_unit_id"))` },
  }));

  // The published workflow and form versions, as version 1 of the new lender.
  out.push(copy(wfDefinitions, src, dst, { where: `s."status" = 'PUBLISHED'`, set: { version: "1" } }));
  out.push(copy(formVersions, src, dst, { where: `s."status" = 'PUBLISHED'`, set: { version: "1" } }));

  // Letters: pictures get new ids (their old ids appear inside the letters, rewritten below).
  const newImage = (id: string) => `'c' || ${dst} || '-' || ${id}`;
  out.push(copy(letterImages, src, dst, { set: { id: newImage(`s."id"`) } }));
  out.push(copy(letterSavedRules, src, dst));
  out.push(copy(letterTemplates, src, dst, {
    where: `s."key" IN (SELECT v."template_key" FROM "letter_versions" v WHERE v."lender_id" = ${src} AND v."status" = 'PUBLISHED')`,
  }));
  let doc = `s."document_json"`;
  for (const id of facts.imageIds.filter((i) => /^[0-9a-fA-F-]{8,64}$/.test(i))) doc = `replace(${doc}, ${q(id)}, ${newImage(q(id))})`;
  out.push(copy(letterVersions, src, dst, { where: `s."status" = 'PUBLISHED'`, set: { version: "1", document_json: doc } }));

  // Everything else that is configuration.
  out.push(copy(emailTemplates, src, dst));
  out.push(copy(brandingSettings, src, dst));
  out.push(copy(loanProducts, src, dst));
  out.push(copy(affordabilityRules, src, dst));
  out.push(copy(faqs, src, dst));
  // Not `domains`: an address belongs to one lender, so the copy starts with none.
  out.push(copy(lenderSettings, src, dst, { where: `s."key" <> 'domains'` }));

  return { statements: out, summary: { mastersWithoutItems: [...skipped] } };
}
