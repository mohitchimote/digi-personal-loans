import { and, eq, inArray, sql } from "drizzle-orm";
import type { getDb } from "../db/client";
import { masterItems, masterTypes } from "../db/schema";
import { AppError } from "./errors";
import { SYSTEM_LISTS, isSystemList } from "./system-lists";
import type { FormVersionSchema } from "./form-schema-types";

// Forms whose fields take their options from a master (see `optionsSource` in form-schema-types.ts).
// The pure decisions live here so they are unit-testable; the two DB wrappers at the bottom are thin.

type Db = ReturnType<typeof getDb>;

/** Problems with how a form schema uses masters, given the master definitions. Empty = fine.
 * Checked when a draft is saved and again at publish (masters can change in between). */
export function masterSourceProblems(
  schema: FormVersionSchema,
  types: ReadonlyMap<string, { parentTypeCode: string | null; attributeKeys?: readonly string[] }>,
): string[] {
  const problems: string[] = [];
  for (const section of schema.sections) {
    const byKey = new Map(section.fields.map((f) => [f.key, f]));
    for (const f of section.fields) {
      const src = f.optionsSource;
      if (!src) continue;
      const where = `${section.key}.${f.key}`;
      const type = types.get(src.master);
      if (!type) { problems.push(`${where}: the master "${src.master}" does not exist.`); continue; }
      if (f.type && f.kind === "custom" && f.type !== "select" && f.type !== "radio") {
        problems.push(`${where}: only select and radio fields can take their options from a master.`);
      }
      if (src.valueAttribute && !(type.attributeKeys ?? []).includes(src.valueAttribute)) {
        problems.push(`${where}: "${src.master}" has no extra field "${src.valueAttribute}" to store.`);
      }
      if (src.dependsOn) {
        const trigger = byKey.get(src.dependsOn.fieldKey);
        const triggerMaster = trigger?.optionsSource?.master;
        if (!type.parentTypeCode) {
          problems.push(`${where}: "${src.master}" has no parent master, so it cannot depend on another field.`);
        } else if (triggerMaster !== type.parentTypeCode) {
          problems.push(`${where}: it must depend on a field that takes its options from "${type.parentTypeCode}" (the parent of "${src.master}").`);
        }
      }
    }
  }
  return problems;
}

export interface MasterItemFacts { active: boolean; parentCode: string | null }

/**
 * Why a submitted value is not acceptable for a master-sourced field, or null if it is.
 *  - `item`: the master item with that code (null if there is none).
 *  - `previous`: the value last saved for this field. Keeping it is always allowed even if the item has
 *    since been deactivated, so editing another field never fails because of old data.
 *  - `dependsOnValue` is given only for a cascading field: the chosen parent code, which must be the
 *    item's parent.
 */
export function masterValueProblem(args: {
  item: MasterItemFacts | null;
  value: string;
  previous: unknown;
  dependsOn: boolean;
  dependsOnValue: unknown;
}): string | null {
  const { item, value, previous, dependsOn, dependsOnValue } = args;
  // Keeping what was already saved never blocks an edit, even if it is older display text that is not
  // an item code (records saved before the field used a master) or an item since deactivated.
  if (previous != null && previous !== "" && String(previous) === value) return null;
  if (!item) return "is not a valid choice";
  if (!item.active) return "is no longer available";
  if (dependsOn) {
    const parent = dependsOnValue == null ? "" : String(dependsOnValue);
    if (!parent) return "needs the field it depends on to be chosen first";
    if (item.parentCode !== parent) return "does not belong to the chosen parent";
  }
  return null;
}

export async function assertMasterSources(db: Db, schema: FormVersionSchema): Promise<void> {
  if (!schema.sections.some((s) => s.fields.some((f) => f.optionsSource))) return;
  const rows = await db.select({ code: masterTypes.code, parentTypeCode: masterTypes.parentTypeCode, attributeDefs: masterTypes.attributeDefs }).from(masterTypes);
  const types = new Map(rows.map((r) => {
    let keys: string[] = [];
    try { keys = (JSON.parse(r.attributeDefs) as { key: string }[]).map((d) => d.key); } catch { /* none */ }
    return [r.code, { parentTypeCode: r.parentTypeCode, attributeKeys: keys }] as const;
  }));
  // System lists (bank staff) are valid sources too, though they are not rows in master_types.
  const merged = new Map(types);
  for (const l of Object.values(SYSTEM_LISTS)) merged.set(l.code, { parentTypeCode: l.parentTypeCode, attributeKeys: [] });
  const problems = masterSourceProblems(schema, merged);
  if (problems.length) throw new AppError(problems.join(" "));
}

/**
 * Looks up the master item a submitted value refers to, with its parent's code, for {@link masterValueProblem}.
 * Normally the value is the item's code. With `valueAttribute` it is that attribute's value instead
 * (a branch number): several items can share it (every bank has a branch "001"), so `parentCode`, when
 * the field cascades, picks the one under the chosen parent.
 */
export async function loadMasterItemFacts(
  db: Db,
  master: string,
  value: string,
  opts: { valueAttribute?: string; parentCode?: string } = {},
): Promise<MasterItemFacts | null> {
  if (isSystemList(master)) return SYSTEM_LISTS[master].find(db, value);
  const candidates = opts.valueAttribute
    ? await db.select().from(masterItems).where(and(
        eq(masterItems.typeCode, master),
        sql`json_extract(${masterItems.attributes}, ${"$." + opts.valueAttribute}) = ${value}`,
      )).limit(500)
    : await db.select().from(masterItems).where(and(eq(masterItems.typeCode, master), eq(masterItems.code, value))).limit(1);
  if (candidates.length === 0) return null;

  const facts = await Promise.all(candidates.map(async (item) => {
    let parentCode: string | null = null;
    if (item.parentId != null) {
      const [p] = await db.select({ code: masterItems.code }).from(masterItems).where(eq(masterItems.id, item.parentId)).limit(1);
      parentCode = p?.code ?? null;
    }
    return { active: item.active, parentCode } satisfies MasterItemFacts;
  }));
  return facts.find((f) => f.parentCode === opts.parentCode) ?? facts[0];
}

/**
 * True when the parent item has no children of this master type at all (a country the state master has no
 * data for yet, a state with no cities). A field cascading from it then accepts free text, so the customer
 * is never stuck on a gap in the data. System lists always have an answer, so they are never "empty".
 */
export async function hasNoChildren(db: Db, master: string, parentCode: string): Promise<boolean> {
  if (isSystemList(master)) return false;
  const [parent] = await db.select({ id: masterItems.id }).from(masterItems)
    .where(and(sql`${masterItems.typeCode} IN (SELECT parent_type_code FROM master_types WHERE code = ${master})`, eq(masterItems.code, parentCode))).limit(1);
  if (!parent) return true;
  const [child] = await db.select({ id: masterItems.id }).from(masterItems)
    .where(and(eq(masterItems.typeCode, master), eq(masterItems.parentId, parent.id))).limit(1);
  return !child;
}

/** The English name of a master item, or the value itself when it is not a code (free text, old records). */
export async function masterItemNameEn(db: Db, master: string, code: string): Promise<string> {
  if (!code) return code;
  const [row] = await db.select({ nameEn: masterItems.nameEn }).from(masterItems)
    .where(and(eq(masterItems.typeCode, master), eq(masterItems.code, code))).limit(1);
  return row?.nameEn ?? code;
}

/** The English and Hebrew names of master items by code, for filling letters. Codes that are not found
 * (free text, old records) come back as themselves in both languages. */
export async function masterItemNames(db: Db, master: string, codes: string[]): Promise<Map<string, { en: string; he: string }>> {
  const out = new Map<string, { en: string; he: string }>();
  const wanted = [...new Set(codes.filter(Boolean))];
  if (wanted.length === 0) return out;
  const rows = await db.select({ code: masterItems.code, nameEn: masterItems.nameEn, nameHe: masterItems.nameHe }).from(masterItems)
    .where(and(eq(masterItems.typeCode, master), inArray(masterItems.code, wanted)));
  for (const r of rows) out.set(r.code, { en: r.nameEn, he: r.nameHe || r.nameEn });
  for (const c of wanted) if (!out.has(c)) out.set(c, { en: c, he: c });
  return out;
}
