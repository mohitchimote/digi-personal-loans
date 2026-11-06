import { isNull, inArray, or, type SQL } from "drizzle-orm";
import type { Db } from "../db/client";
import { orgUnits, loanApplications } from "../db/schema";
import type { AuthUser } from "../types";
import type { Scope } from "./entitlements";
import { AppError } from "./errors";


/** The unit itself plus every descendant, walking parentId links. */
export async function subtreeIds(db: Db, rootId: number): Promise<number[]> {
  const all = await db.select({ id: orgUnits.id, parentId: orgUnits.parentId }).from(orgUnits);
  const childrenOf = new Map<number, number[]>();
  for (const u of all) {
    if (u.parentId == null) continue;
    const list = childrenOf.get(u.parentId) ?? [];
    list.push(u.id);
    childrenOf.set(u.parentId, list);
  }
  const out: number[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.includes(id)) continue; // cycle guard
    out.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return out;
}

/** Org unit ids the user may see cases for, or null when unrestricted. */
export async function visibleOrgUnitIds(db: Db, user: AuthUser, scope: Scope): Promise<number[] | null> {
  // Scope comes from the user's admin-configured role. A user with no org unit assigned stays
  // unrestricted (pre-hierarchy behaviour) whatever their role's scope says.
  if (scope === "ALL" || user.orgUnitId == null) return null;
  return scope === "UNIT_ONLY" ? [user.orgUnitId] : subtreeIds(db, user.orgUnitId);
}

/** WHERE fragment restricting loan_applications to the user's scope (undefined = no restriction).
 * Unassigned cases (null org unit, e.g. digital self-service) stay visible to everyone. */
export async function caseScopeCondition(db: Db, user: AuthUser, scope: Scope): Promise<SQL | undefined> {
  const ids = await visibleOrgUnitIds(db, user, scope);
  if (ids === null) return undefined;
  return or(isNull(loanApplications.orgUnitId), inArray(loanApplications.orgUnitId, ids));
}

/** Throws 404 (not 403 — don't confirm existence) if the case is outside the user's scope. */
export async function isCaseVisible(db: Db, user: AuthUser, scope: Scope, app: { orgUnitId: number | null }): Promise<boolean> {
  const ids = await visibleOrgUnitIds(db, user, scope);
  return ids === null || app.orgUnitId == null || ids.includes(app.orgUnitId);
}

export async function assertCaseVisible(db: Db, user: AuthUser, scope: Scope, app: { orgUnitId: number | null }): Promise<void> {
  if (!(await isCaseVisible(db, user, scope, app))) throw new AppError("Application not found.", 404);
}
