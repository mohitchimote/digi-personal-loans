import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { affordabilityRules } from "../db/schema";
import { cached, invalidate } from "./cache";

const RULES_CACHE_KEY = "affordability-rules";
const RULES_TTL_MS = 30_000;

// The single admin-editable affordability-rules row, cached — see lib/cache.ts. Every route that
// updates this row must call invalidateAffordabilityRulesCache() so the change is visible
// immediately, not after the TTL expires.
export async function getAffordabilityRules(db: Db) {
  return cached(RULES_CACHE_KEY, RULES_TTL_MS, async () => {
    const [rules] = await db.select().from(affordabilityRules).where(eq(affordabilityRules.id, 1)).limit(1);
    return rules ?? null;
  });
}

export function invalidateAffordabilityRulesCache(): void {
  invalidate(RULES_CACHE_KEY);
}

// Inlined equivalent of AffordabilityClient.getAutoApprovalThreshold.
export async function getAutoApprovalThreshold(db: Db, jointApplication: boolean): Promise<number | null> {
  const rules = await getAffordabilityRules(db);
  if (!rules) return null;
  return jointApplication ? rules.autoApprovalThresholdJoint : rules.autoApprovalThresholdSingle;
}
