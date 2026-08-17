import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { preApprovedOffers } from "../db/schema";

// Inlined equivalent of ProductClient.getPreApprovedOffer / consumePreApprovedOffer.
export async function getPreApprovedOffer(db: Db, nationalId: string) {
  const [offer] = await db
    .select()
    .from(preApprovedOffers)
    .where(and(eq(preApprovedOffers.nationalId, nationalId), eq(preApprovedOffers.consumed, false)))
    .limit(1);
  return offer ?? null;
}

export async function consumePreApprovedOffer(db: Db, nationalId: string) {
  await db
    .update(preApprovedOffers)
    .set({ consumed: true })
    .where(and(eq(preApprovedOffers.nationalId, nationalId), eq(preApprovedOffers.consumed, false)));
}
