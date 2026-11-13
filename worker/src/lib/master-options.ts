import { and, eq } from "drizzle-orm";
import type { getDb } from "../db/client";
import { masterItems, masterTypes } from "../db/schema";
import { AppError } from "./errors";
import type { FormVersionSchema } from "./form-schema-types";

// Forms whose fields take their options from a master (see `optionsSource` in form-schema-types.ts).
// The pure decisions live here so they are unit-testable; the two DB wrappers at the bottom are thin.

type Db = ReturnType<typeof getDb>;

/** Problems with how a form schema uses masters, given the master definitions. Empty = fine.
 * Checked when a draft is saved and again at publish (masters can change in between). */
export function masterSourceProblems(
  schema: FormVersionSchema,
  types: ReadonlyMap<string, { parentTypeCode: string | null }>,
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
  if (!item) return "is not a valid choice";
  if (!item.active && String(previous ?? "") !== value) return "is no longer available";
  if (dependsOn) {
    const parent = dependsOnValue == null ? "" : String(dependsOnValue);
    if (!parent) return "needs the field it depends on to be chosen first";
    if (item.parentCode !== parent) return "does not belong to the chosen parent";
  }
  return null;
}

export async function assertMasterSources(db: Db, schema: FormVersionSchema): Promise<void> {
  if (!schema.sections.some((s) => s.fields.some((f) => f.optionsSource))) return;
  const rows = await db.select({ code: masterTypes.code, parentTypeCode: masterTypes.parentTypeCode }).from(masterTypes);
  const problems = masterSourceProblems(schema, new Map(rows.map((r) => [r.code, r])));
  if (problems.length) throw new AppError(problems.join(" "));
}

/** Looks up a master item and its parent's code, for {@link masterValueProblem}. */
export async function loadMasterItemFacts(db: Db, master: string, code: string): Promise<MasterItemFacts | null> {
  const [item] = await db.select().from(masterItems).where(and(eq(masterItems.typeCode, master), eq(masterItems.code, code))).limit(1);
  if (!item) return null;
  let parentCode: string | null = null;
  if (item.parentId != null) {
    const [p] = await db.select({ code: masterItems.code }).from(masterItems).where(eq(masterItems.id, item.parentId)).limit(1);
    parentCode = p?.code ?? null;
  }
  return { active: item.active, parentCode };
}
