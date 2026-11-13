// Cuts seed-reference.sql down for a remote database with a daily write limit (D1 free plan: 100k rows/day
// across the account). Everything except cities is kept; cities are kept only for the country codes given.
//   node scripts/seed-reference-stage.mjs IL GB US > /tmp/stage.sql
//   npx wrangler d1 execute <db> --remote -c <config> --file=/tmp/stage.sql
// Run it again with other countries on later days; the seed is idempotent (INSERT OR IGNORE).
import { readFileSync } from "node:fs";
const want = new Set(process.argv.slice(2).map((c) => c.toUpperCase()));
const sql = readFileSync(new URL("../seed-reference.sql", import.meta.url), "utf8");
const out = [];
let kept = 0, skipped = 0;
for (const stmt of sql.split(/;\n/).filter((s) => s.trim())) {
  if (!stmt.includes("SELECT 'city'")) { out.push(stmt); continue; }
  const first = /\(\s*'([A-Z]{2})-/.exec(stmt)?.[1];
  if (first && want.has(first)) { out.push(stmt); kept++; } else skipped++;
}
process.stderr.write(`city chunks kept: ${kept}, skipped: ${skipped}\n`);
process.stdout.write(out.join(";\n") + ";\n");
