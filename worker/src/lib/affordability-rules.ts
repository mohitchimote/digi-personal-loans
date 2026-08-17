import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { affordabilityRules } from "../db/schema";

// Inlined equivalent of AffordabilityClient.getAutoApprovalThreshold.
export async function getAutoApprovalThreshold(db: Db, jointApplication: boolean): Promise<number | null> {
  const [rules] = await db.select().from(affordabilityRules).where(eq(affordabilityRules.id, 1)).limit(1);
  if (!rules) return null;
  return jointApplication ? rules.autoApprovalThresholdJoint : rules.autoApprovalThresholdSingle;
}
