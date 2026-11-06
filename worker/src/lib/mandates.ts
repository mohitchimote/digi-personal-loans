import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { mandates, orgUnits, caseReferrals } from "../db/schema";
import { allRoleConfigs, type RoleConfig } from "./roles";
import { AppError } from "./errors";

/** The org unit itself then each ancestor, nearest first. */
export async function ancestorChain(db: Db, unitId: number | null): Promise<number[]> {
  if (unitId == null) return [];
  const rows = await db.select({ id: orgUnits.id, parentId: orgUnits.parentId }).from(orgUnits);
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
  const chain: number[] = [];
  let cur: number | null | undefined = unitId;
  while (cur != null && !chain.includes(cur)) {
    chain.push(cur);
    cur = parentOf.get(cur);
  }
  return chain;
}

export interface ResolvedMandate {
  limit: number;
  /** The matching row's context (null = the role default applied). */
  orgUnitId: number | null;
  applicationType: string | null;
}

/** Approval limit for a role on a particular case. Most specific row wins: nearest org unit
 * first, then an application-type match; the role default (no unit, no type) is the fallback.
 * No matching row at all means no approval authority (limit 0). */
export async function resolveMandate(
  db: Db,
  roleCode: string,
  orgUnitId: number | null,
  applicationType: string | null
): Promise<ResolvedMandate> {
  const rows = await db.select().from(mandates).where(eq(mandates.roleCode, roleCode));
  const chain = await ancestorChain(db, orgUnitId);
  const candidates = rows
    .filter((m) => (m.orgUnitId == null || chain.includes(m.orgUnitId)) && (m.applicationType == null || m.applicationType === applicationType))
    .map((m) => ({ m, unitDist: m.orgUnitId == null ? Number.POSITIVE_INFINITY : chain.indexOf(m.orgUnitId), typeMatch: m.applicationType != null }));
  candidates.sort((a, b) => a.unitDist - b.unitDist || Number(b.typeMatch) - Number(a.typeMatch));
  const best = candidates[0]?.m;
  return best
    ? { limit: best.maxAmount, orgUnitId: best.orgUnitId, applicationType: best.applicationType }
    : { limit: 0, orgUnitId: null, applicationType: null };
}

/** The ranked role immediately above `rank` (a referral target), or null at the top. */
export async function nextRoleUp(db: Db, rank: number | null): Promise<RoleConfig | null> {
  const ladder = (await allRoleConfigs(db)).filter((r) => r.rank != null && r.rank > (rank ?? -1)).sort((a, b) => a.rank! - b.rank!);
  return ladder[0] ?? null;
}

/** Role codes sitting at or below a rank - used to hide referred cases from more junior roles. */
export async function roleCodesAbove(db: Db, rank: number): Promise<string[]> {
  return (await allRoleConfigs(db)).filter((r) => r.rank != null && r.rank > rank).map((r) => r.code);
}

/** If the case is referred to a role above `role`, the label of that role (the case is locked to
 * it); otherwise null. */
export async function referralLockLabel(
  db: Db,
  app: { status: string; referredToRole: string | null },
  role: RoleConfig
): Promise<string | null> {
  if (app.status !== "REFERRED_TO_SENIOR" || !app.referredToRole || role.rank == null) return null;
  const target = (await allRoleConfigs(db)).find((r) => r.code === app.referredToRole);
  return target?.rank != null && role.rank < target.rank ? target.label : null;
}

/** A case referred to a role can only be acted on by that role or one higher on the ladder. */
export async function assertCanActOnReferral(
  db: Db,
  app: { status: string; referredToRole: string | null },
  role: RoleConfig
): Promise<void> {
  const label = await referralLockLabel(db, app, role);
  if (label) throw new AppError(`This case has been referred to ${label} and can only be actioned at that level or above.`, 403);
}

export async function closeReferrals(db: Db, applicationRef: string): Promise<void> {
  const now = new Date().toISOString();
  const open = await db.select({ id: caseReferrals.id, resolvedAt: caseReferrals.resolvedAt }).from(caseReferrals).where(eq(caseReferrals.applicationRef, applicationRef));
  for (const r of open) {
    if (r.resolvedAt == null) await db.update(caseReferrals).set({ resolvedAt: now }).where(eq(caseReferrals.id, r.id));
  }
}
