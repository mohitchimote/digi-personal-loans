import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The wizard builds its dropdowns from `formSchema` on the application it is handed. A customer's
// first visit gets that application from a /start endpoint (there is no application yet to GET), so
// every /start* response must carry the form definition too, or the first load shows empty dropdowns.
const src = readFileSync(join(__dirname, "../src/routes/applications.ts"), "utf8");

function handlerBody(path: string): string {
  const start = src.indexOf(`applications.post("${path}"`);
  expect(start).toBeGreaterThan(-1);
  const next = src.indexOf("\napplications.", start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

describe("/start endpoints return the form definition", () => {
  for (const path of ["/start", "/start-business", "/start-pre-approved"]) {
    it(path, () => {
      const body = handlerBody(path);
      const returns = body.match(/return c\.json\([^;]*\);/g) ?? [];
      expect(returns.length).toBeGreaterThan(0);
      for (const r of returns) expect(r).toContain("withResolvedFormVersion");
    });
  }
});
