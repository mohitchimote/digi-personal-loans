import type { Db } from "../db/client";
import { roles, roleEntitlements } from "../db/schema";
import { cached, invalidate } from "./cache";
import { ENTITLEMENT_KEYS, type Scope } from "./entitlements";

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

const ROLE_CONFIG_CACHE_KEY = "role-config";
const ROLE_CONFIG_TTL_MS = 30_000;

export function invalidateRoleConfig(): void {
  invalidate(ROLE_CONFIG_CACHE_KEY);
}

async function loadAll(db: Db): Promise<Map<string, RoleConfig>> {
  return cached(ROLE_CONFIG_CACHE_KEY, ROLE_CONFIG_TTL_MS, async () => {
    const roleRows = await db.select().from(roles);
    const entRows = await db.select().from(roleEntitlements);
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

/** Resolved config for a role code. Unknown codes (customers, or a deleted role) hold nothing. */
export async function resolveRole(db: Db, code: string): Promise<RoleConfig> {
  return (await loadAll(db)).get(code) ?? NOT_STAFF(code);
}

/** Every staff role config (for the escalation ladder). */
export async function allRoleConfigs(db: Db): Promise<RoleConfig[]> {
  return [...(await loadAll(db)).values()];
}

export async function staffRoleCodes(db: Db): Promise<string[]> {
  return [...(await loadAll(db)).keys()];
}
