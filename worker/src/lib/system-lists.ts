import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { orgLevels, orgUnits, users } from "../db/schema";
import { staffRoleCodes } from "./roles";
import { subtreeIds } from "./org";
import type { BilingualLabel as Bilingual } from "./form-schema-types";

// System lists: pick-lists a form can use that are not masters because their data already lives
// elsewhere and is managed there. Bank staff come from the Users table (roles, entitlements, org unit),
// so they are read from it directly, never copied into a master that someone would have to keep in step.
// A form field points at one exactly as it points at a master (`optionsSource.master: "staff"`), and the
// pick-list API serves it from the same endpoint, but only to signed-in users.

export interface ListEntry { code: string; name: Bilingual; parentCode: string | null; attributes: Record<string, unknown> }
export interface EntryFacts { active: boolean; parentCode: string | null }

export interface SystemList {
  code: string;
  label: Bilingual;
  /** The master this list's entries hang under (staff belong to a branch). */
  parentTypeCode: string | null;
  list(db: Db, opts: { parentCode?: string; q?: string; limit: number }): Promise<ListEntry[]>;
  find(db: Db, code: string): Promise<EntryFacts | null>;
}

/** The branch master item an org unit belongs to: its own link, or the nearest ancestor's. */
async function branchCodeOfUnit(db: Db, unitId: number | null): Promise<string | null> {
  const seen = new Set<number>();
  let cur = unitId;
  while (cur != null && !seen.has(cur)) {
    seen.add(cur);
    const [row] = await db.select({ parentId: orgUnits.parentId, masterCode: orgUnits.masterCode, masterType: orgLevels.masterTypeCode })
      .from(orgUnits).innerJoin(orgLevels, eq(orgLevels.id, orgUnits.levelId)).where(eq(orgUnits.id, cur)).limit(1);
    if (!row) return null;
    if (row.masterType === "branch" && row.masterCode) return row.masterCode;
    cur = row.parentId;
  }
  return null;
}

/** Org units that stand for a branch (a unit linked to that item in the Branch master), with everything beneath them. */
async function unitsOfBranch(db: Db, branchCode: string): Promise<number[]> {
  const roots = await db.select({ id: orgUnits.id }).from(orgUnits).innerJoin(orgLevels, eq(orgLevels.id, orgUnits.levelId))
    .where(and(eq(orgLevels.masterTypeCode, "branch"), eq(orgUnits.masterCode, branchCode)));
  const ids = new Set<number>();
  for (const r of roots) for (const id of await subtreeIds(db, r.id)) ids.add(id);
  return [...ids];
}

const staff: SystemList = {
  code: "staff",
  label: { en: "Bank staff (from Users)", he: "צוות הבנק (מתוך משתמשים)" },
  parentTypeCode: "branch",
  async list(db, { parentCode, q, limit }) {
    const roles = await staffRoleCodes(db);
    if (!roles.length) return [];
    let rows = await db.select({ uuid: users.uuid, fullName: users.fullName, orgUnitId: users.orgUnitId })
      .from(users).where(and(inArray(users.role, roles), eq(users.enabled, true)));
    if (parentCode) {
      const units = new Set(await unitsOfBranch(db, parentCode));
      rows = rows.filter((r) => r.orgUnitId != null && units.has(r.orgUnitId));
    } else {
      rows = rows.filter((r) => r.orgUnitId != null);
    }
    const needle = (q ?? "").trim().toLowerCase();
    return rows
      .filter((r) => r.fullName && (!needle || r.fullName.toLowerCase().includes(needle)))
      .sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""))
      .slice(0, limit)
      .map((r) => ({ code: r.uuid, name: { en: r.fullName!, he: r.fullName! }, parentCode: parentCode ?? null, attributes: {} }));
  },
  async find(db, code) {
    const [u] = await db.select({ role: users.role, enabled: users.enabled, orgUnitId: users.orgUnitId }).from(users).where(eq(users.uuid, code)).limit(1);
    if (!u) return null;
    const isStaff = (await staffRoleCodes(db)).includes(u.role);
    return { active: !!u.enabled && isStaff, parentCode: await branchCodeOfUnit(db, u.orgUnitId) };
  },
};

export const SYSTEM_LISTS: Record<string, SystemList> = { staff };
export const isSystemList = (code: string): boolean => Object.prototype.hasOwnProperty.call(SYSTEM_LISTS, code);
