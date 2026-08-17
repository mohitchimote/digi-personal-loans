import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { loanProducts, productSelections } from "../db/schema";
import { AppError } from "../lib/errors";
import { calculateMonthlyRepayment } from "../lib/repayment";
import { getPreApprovedOffer, consumePreApprovedOffer } from "../lib/pre-approved";

export const products = new Hono<AppEnv>();

interface EligibilityRequest {
  applicationRef?: string;
  monthlyGrossIncome?: number;
  creditScore?: number;
  riskCategory?: string;
  requestedAmount?: number;
  requestedTermMonths?: number;
  dti?: number;
  productType?: "PERSONAL" | "BUSINESS";
}

function isEligible(p: typeof loanProducts.$inferSelect, req: EligibilityRequest): boolean {
  if (req.creditScore != null && p.minCreditScore != null && req.creditScore < p.minCreditScore) return false;
  if (req.monthlyGrossIncome != null && p.minMonthlyIncome != null && req.monthlyGrossIncome < p.minMonthlyIncome)
    return false;
  if (req.requestedAmount != null && p.minAmount != null && p.maxAmount != null) {
    if (req.requestedAmount < p.minAmount || req.requestedAmount > p.maxAmount) return false;
  }
  if (req.dti != null && p.maxDti != null && req.dti > p.maxDti) return false;
  if (req.riskCategory && p.riskCategories) {
    const allowed = p.riskCategories.split(",");
    if (!allowed.includes(req.riskCategory)) return false;
  }
  return true;
}

function toEligibleProduct(p: typeof loanProducts.$inferSelect, req: EligibilityRequest) {
  const term = req.requestedTermMonths ?? p.minTermMonths ?? 12;
  const amount = req.requestedAmount ?? p.minAmount ?? 0;
  const rate = p.annualInterestRate ?? 0;
  const monthly = calculateMonthlyRepayment(rate, amount, term);
  const total = Math.round(monthly * term * 100) / 100;

  return {
    productId: p.productCode,
    productName: p.productName,
    description: p.description,
    interestRate: rate,
    minAmount: p.minAmount,
    maxAmount: p.maxAmount,
    minTermMonths: p.minTermMonths,
    maxTermMonths: p.maxTermMonths,
    monthlyRepayment: monthly,
    totalRepayable: total,
    apr: rate,
    recommended: false,
    badge: null as string | null,
  };
}

products.post("/eligible", async (c) => {
  const db = getDb(c.env.DB);
  const req = await c.req.json<EligibilityRequest>();
  const productType = req.productType ?? "PERSONAL";

  const all = await db
    .select()
    .from(loanProducts)
    .where(and(eq(loanProducts.active, true), eq(loanProducts.productType, productType)));

  const eligible = all
    .filter((p) => isEligible(p, req))
    .map((p) => toEligibleProduct(p, req))
    .sort((a, b) => (a.interestRate ?? 0) - (b.interestRate ?? 0));

  if (eligible.length > 0) {
    eligible[0].recommended = true;
    eligible[0].badge = "Best Rate";
  }

  return c.json(eligible);
});

products.post("/select", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ applicationRef: string; productCode: string; termMonths?: number }>();

  const [product] = await db
    .select()
    .from(loanProducts)
    .where(and(eq(loanProducts.active, true), eq(loanProducts.productCode, body.productCode)))
    .limit(1);
  if (!product) throw new AppError(`Product not found: ${body.productCode}`);

  const term = body.termMonths ?? product.minTermMonths ?? 12;
  const monthlyRepayment = calculateMonthlyRepayment(product.annualInterestRate ?? 0, 100000, term);
  const totalRepayable = Math.round(monthlyRepayment * term * 100) / 100;

  const [saved] = await db
    .insert(productSelections)
    .values({
      applicationRef: body.applicationRef,
      productCode: product.productCode,
      productName: product.productName,
      termMonths: term,
      monthlyRepayment,
      totalRepayable,
      apr: product.annualInterestRate,
      selectedAt: new Date().toISOString(),
    })
    .returning();
  return c.json(saved);
});

products.get("/selection/:appRef", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const [selection] = await db
    .select()
    .from(productSelections)
    .where(eq(productSelections.applicationRef, appRef))
    .limit(1);
  if (!selection) throw new AppError(`No product selected for application: ${appRef}`);
  return c.json(selection);
});

products.get("/pre-approved/:nationalId", async (c) => {
  const db = getDb(c.env.DB);
  const offer = await getPreApprovedOffer(db, c.req.param("nationalId"));
  if (!offer) return c.body(null, 404);
  return c.json(offer);
});

products.post("/pre-approved/:nationalId/consume", async (c) => {
  const db = getDb(c.env.DB);
  const nationalId = c.req.param("nationalId");
  const offer = await getPreApprovedOffer(db, nationalId);
  if (!offer) throw new AppError("No pre-approved offer found for this National ID.");
  await consumePreApprovedOffer(db, nationalId);
  return c.json({ ...offer, consumed: true });
});

products.get("/admin/all", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(loanProducts).orderBy(asc(loanProducts.productType), asc(loanProducts.productName));
  return c.json(rows);
});

products.post("/admin", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<Partial<typeof loanProducts.$inferInsert>>();
  if (!body.productCode?.trim()) throw new AppError("Product code is required.");
  const [existing] = await db.select().from(loanProducts).where(eq(loanProducts.productCode, body.productCode)).limit(1);
  if (existing) throw new AppError(`Product code already exists: ${body.productCode}`);

  const [created] = await db
    .insert(loanProducts)
    .values({ ...body, productCode: body.productCode, productType: body.productType?.trim() || "PERSONAL" } as any)
    .returning();
  return c.json(created, 201);
});

products.put("/admin/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(loanProducts).where(eq(loanProducts.id, id)).limit(1);
  if (!existing) throw new AppError(`Product not found: ${id}`);

  const body = await c.req.json<Partial<typeof loanProducts.$inferInsert>>();
  if (body.productCode && body.productCode !== existing.productCode) {
    const [dup] = await db.select().from(loanProducts).where(eq(loanProducts.productCode, body.productCode)).limit(1);
    if (dup) throw new AppError(`Product code already exists: ${body.productCode}`);
  }

  const [updated] = await db
    .update(loanProducts)
    .set({
      productCode: body.productCode ?? existing.productCode,
      productName: body.productName ?? existing.productName,
      description: body.description ?? existing.description,
      annualInterestRate: body.annualInterestRate ?? existing.annualInterestRate,
      minAmount: body.minAmount ?? existing.minAmount,
      maxAmount: body.maxAmount ?? existing.maxAmount,
      minTermMonths: body.minTermMonths ?? existing.minTermMonths,
      maxTermMonths: body.maxTermMonths ?? existing.maxTermMonths,
      minCreditScore: body.minCreditScore ?? existing.minCreditScore,
      minMonthlyIncome: body.minMonthlyIncome ?? existing.minMonthlyIncome,
      maxDti: body.maxDti ?? existing.maxDti,
      riskCategories: body.riskCategories ?? existing.riskCategories,
      active: body.active ?? existing.active,
      productType: body.productType ?? existing.productType,
    })
    .where(eq(loanProducts.id, id))
    .returning();
  return c.json(updated);
});

products.delete("/admin/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(loanProducts).where(eq(loanProducts.id, id)).limit(1);
  if (!existing) throw new AppError(`Product not found: ${id}`);
  await db.delete(loanProducts).where(eq(loanProducts.id, id));
  return c.body(null, 204);
});
