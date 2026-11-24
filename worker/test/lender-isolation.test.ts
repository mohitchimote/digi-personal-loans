import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Static guard for multi-tenancy phase 3. Every query on a tenant table (one with a lender_id
// column) must be limited to a lender: the statement has to mention `inLender`, `lenderId` or
// `lender_id`. Nothing is exempt except the files below; a new query that skips the filter fails here.
// This is a static check of the statement text. The behavioural proof is scripts/lender-isolation-check.mjs.
const SRC = join(__dirname, "../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

function tenantTables(): Map<string, string> {
  const schema = readFileSync(join(SRC, "db/schema.ts"), "utf8");
  const out = new Map<string, string>();
  const re = /export const (\w+) = sqliteTable\("(\w+)",\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) {
    if (/lenderId:\s*(lenderIdCol\(\)|integer\("lender_id"\))/.test(m[3]) && m[1] !== "lenders" && m[1] !== "lenderSettings") out.set(m[1], m[2]);
  }
  return out;
}

// Pre-auth and platform code that legitimately looks across lenders (login lookups, lender admin).
// lib/otp.ts only updates the OTP columns of a user row it was handed (keyed by that user's own id).
const EXEMPT = new Set(["db/schema.ts", "lib/lenders.ts", "middleware/auth.ts", "lib/otp.ts"]);

export function findUnscoped(file: string, text: string, tables: Map<string, string>): string[] {
  const names = [...tables.keys()].join("|");
  const re = new RegExp(`\\.(from|update|delete|insert|innerJoin|leftJoin)\\((${names})\\b`, "g");
  const bad: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = text.indexOf(";", m.index);
    const stmt = text.slice(m.index, end < 0 ? undefined : end);
    if (!/inLender|lenderId|lender_id/.test(stmt)) {
      const line = text.slice(0, m.index).split("\n").length;
      bad.push(`${file}:${line} ${m[1]}(${m[2]})`);
    }
  }
  return bad;
}

describe("lender isolation (static)", () => {
  const tables = tenantTables();
  it("finds the tenant tables", () => {
    expect(tables.size).toBeGreaterThan(30);
    expect(tables.has("loanApplications")).toBe(true);
  });
  it("flags an unscoped query", () => {
    expect(findUnscoped("x.ts", "const r = await db.select().from(faqs).where(eq(faqs.id, 1));", tables)).toHaveLength(1);
    expect(findUnscoped("x.ts", "const r = await db.select().from(faqs).where(inLender(faqs, lid));", tables)).toHaveLength(0);
  });
  it("has no unscoped tenant queries outside the pending list", () => {
    const found: string[] = [];
    for (const path of walk(SRC)) {
      const rel = path.slice(SRC.length + 1);
      if (EXEMPT.has(rel)) continue;
      found.push(...findUnscoped(rel, readFileSync(path, "utf8"), tables));
    }
    expect(found.join("\n")).toBe("");
  });
});
