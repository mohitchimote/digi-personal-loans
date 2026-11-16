import type { Db } from "../db/client";
import { eq } from "drizzle-orm";
import { roles, roleEntitlements } from "../db/schema";
import { cached, invalidate } from "./cache";
import { ENTITLEMENT_KEYS, PLATFORM_ENTITLEMENT_KEYS, type Scope } from "./entitlements";
import { SUPER_ADMIN_ROLE } from "./lenders";

// Phase 2 - staff roles are data (the `roles` + `role_entitlements` tables, edited in the admin
// Roles page), not a code constant. Customer roles stay built in and are never staff.
export const CUSTOMER_ROLES = ["CUSTOMER", "BUSINESS_OWNER"];

export interface RoleConfig {
  code: string;
  label: string;
  isStaff: boolean;
  scope: Scope;
  /** Position on the escalation ladder (lower = more junior); null = not on the ladder. */
  rank: number | null;
  entitlements: Set<string>;
}

const ROLE_CONFIG_CACHE_PREFIX = "role-config:";
const ROLE_CONFIG_TTL_MS = 30_000;

/** Drop the cached role configuration of one lender (call after any role/entitlement edit). */
export function invalidateRoleConfig(lenderId: number): void {
  invalidate(ROLE_CONFIG_CACHE_PREFIX + lenderId);
}

async function loadAll(db: Db, lenderId: number): Promise<Map<string, RoleConfig>> {
  return cached(ROLE_CONFIG_CACHE_PREFIX + lenderId, ROLE_CONFIG_TTL_MS, async () => {
    const roleRows = await db.select().from(roles).where(eq(roles.lenderId, lenderId));
    const entRows = await db.select().from(roleEntitlements).where(eq(roleEntitlements.lenderId, lenderId));
    const map = new Map<string, RoleConfig>();
    for (const r of roleRows) {
      const ents = r.locked
        ? new Set(ENTITLEMENT_KEYS) // locked super-role: always everything, whatever the table says
        : new Set(entRows.filter((e) => e.roleCode === r.code).map((e) => e.entitlement));
      map.set(r.code, { code: r.code, label: r.label, isStaff: true, scope: r.scope as Scope, rank: r.escalationRank ?? null, entitlements: ents });
    }
    return map;
  });
}

const NOT_STAFF = (code: string): RoleConfig => ({ code, label: code, isStaff: false, scope: "ALL", rank: null, entitlements: new Set() });

/** The platform super admin: built in (not a row in `roles`, since it belongs to no lender), holds
 * every lender entitlement plus the platform ones, and sees every case of the lender it is inside. */
const SUPER_ADMIN_CONFIG: RoleConfig = {
  code: SUPER_ADMIN_ROLE,
  label: "Super Admin",
  isStaff: true,
  scope: "ALL",
  rank: null,
  entitlements: new Set([...ENTITLEMENT_KEYS, ...PLATFORM_ENTITLEMENT_KEYS]),
};

/** Resolved config for a role code within a lender. Unknown codes (customers, or a deleted role)
 * hold nothing. */
export async function resolveRole(db: Db, lenderId: number, code: string): Promise<RoleConfig> {
  if (code === SUPER_ADMIN_ROLE) return SUPER_ADMIN_CONFIG;
  return (await loadAll(db, lenderId)).get(code) ?? NOT_STAFF(code);
}

/** Every staff role config of a lender (for the escalation ladder). */
export async function allRoleConfigs(db: Db, lenderId: number): Promise<RoleConfig[]> {
  return [...(await loadAll(db, lenderId)).values()];
}

export async function staffRoleCodes(db: Db, lenderId: number): Promise<string[]> {
  return [...(await loadAll(db, lenderId)).keys()];
}
