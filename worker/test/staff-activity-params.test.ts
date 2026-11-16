import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { and, desc, inArray } from "drizzle-orm";
import { loanApplications, underwritingNotes } from "../src/db/schema";

// D1 allows at most 100 bound values per statement. The staff-activity notes query must not bind
// one value per application (it returned a 500 on UAT once there were more than 100).
describe("staff-activity notes query", () => {
  it("binds a fixed number of values regardless of how many applications exist", () => {
    const db = drizzle({} as never);
    const where = and(inArray(loanApplications.status, ["IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW"]));
    const { params } = db
      .select()
      .from(underwritingNotes)
      .where(inArray(underwritingNotes.applicationRef, db.select({ ref: loanApplications.applicationRef }).from(loanApplications).where(where)))
      .orderBy(desc(underwritingNotes.createdAt))
      .limit(50)
      .toSQL();
    expect(params.length).toBeLessThan(20);
  });
});
