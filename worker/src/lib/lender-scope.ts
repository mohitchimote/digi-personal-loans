import { and, eq, type SQL } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import { AppError } from "./errors";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * The one way a query is limited to a lender: `where(inLender(t, lenderId, ...conditions))`.
 * Every tenant table has a `lender_id` column; test/lender-isolation.test.ts fails when a query on
 * such a table does not mention `inLender` or `lenderId`.
 */
export function inLender(table: { lenderId: SQLiteColumn }, lenderId: number, ...conditions: (SQL | undefined)[]): SQL {
  const scoped = and(eq(table.lenderId, lenderId), ...conditions);
  return scoped as SQL;
}

/** A user id that arrives in a request (body or path) must belong to the caller's lender. */
export async function assertUserInLender(db: Db, lenderId: number, userId: number): Promise<void> {
  const [u] = await db.select({ id: users.id }).from(users).where(inLender(users, lenderId, eq(users.id, userId))).limit(1);
  if (!u) throw new AppError("Customer not found.", 404);
}
