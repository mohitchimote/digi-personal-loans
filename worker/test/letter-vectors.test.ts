import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatValue } from "../src/lib/letters/formats";
import { evalRule, type EvalContext } from "../src/lib/letters/rules";
import { resolveLetter } from "../src/lib/letters/resolve";
import { parseMarkup } from "../src/lib/letters/markup";
import { validateLetter } from "../src/lib/letters/validate";
import type { Dictionary, Lang, LetterDocument, Rule, SavedRule } from "../src/lib/letters/types";

// Runs letter-spec/vectors/*.json against the Worker's letter engine. The Java engine runs the same
// files; see letter-spec/README.md. Expected values were derived by hand from the written rules.

const specDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../letter-spec");
const readJson = (p: string) => JSON.parse(readFileSync(resolve(specDir, p), "utf8"));

/** Every key in `expected` must equal `actual`, recursively; arrays must match in length and order. */
function matches(actual: unknown, expected: unknown, path = "$"): string | null {
  if (expected === null || typeof expected !== "object") return actual === expected ? null : `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${path}: expected an array, got ${JSON.stringify(actual)}`;
    if (actual.length !== expected.length) return `${path}: expected ${expected.length} item(s), got ${actual.length}: ${JSON.stringify(actual)}`;
    for (let i = 0; i < expected.length; i++) { const r = matches(actual[i], expected[i], `${path}[${i}]`); if (r) return r; }
    return null;
  }
  if (actual === null || typeof actual !== "object") return `${path}: expected an object, got ${JSON.stringify(actual)}`;
  for (const [k, v] of Object.entries(expected as Record<string, unknown>)) { const r = matches((actual as Record<string, unknown>)[k], v, `${path}.${k}`); if (r) return r; }
  return null;
}

describe("letter-spec formats", () => {
  const file = readJson("vectors/formats.json");
  for (const v of file.vectors) {
    it(v.name, () => {
      expect(formatValue(v.value, { type: v.type, choices: v.choices }, v.fmt, v.lang as Lang)).toBe(v.expect);
    });
  }
});

describe("letter-spec rules", () => {
  const file = readJson("vectors/rules.json");
  const dictionary: Dictionary = readJson(file.dictionary);
  const saved = new Map((file.savedRules as SavedRule[]).map((s) => [s.id, s]));
  const ctx: EvalContext = { data: file.data, today: file.today, dictionary, saved };
  for (const v of file.vectors) {
    it(v.name, () => {
      expect(evalRule(v.rule as Rule, ctx)).toBe(v.expect);
    });
  }
});

describe("letter-spec resolve", () => {
  const file = readJson("vectors/resolve.json");
  const dictionary: Dictionary = readJson(file.dictionary);
  for (const v of file.vectors) {
    it(v.name, () => {
      for (const lang of ["en", "he"] as Lang[]) {
        const want = v.expect[lang]; if (!want) continue;
        const got = resolveLetter({ document: v.document as LetterDocument, dictionary, savedRules: file.savedRules, data: v.data, today: v.today ?? file.today }, lang);
        expect(matches(got, want, `$.${lang}`)).toBeNull();
      }
      if (v.expect.decisions) {
        const got = resolveLetter({ document: v.document as LetterDocument, dictionary, savedRules: file.savedRules, data: v.data, today: v.today ?? file.today }, "en");
        expect(matches(got.decisions, v.expect.decisions, "$.decisions")).toBeNull();
      }
    });
  }
});

describe("letter-spec validate", () => {
  const file = readJson("vectors/validate.json");
  const dictionary: Dictionary = readJson(file.dictionary);
  for (const v of file.vectors) {
    it(v.name, () => {
      const issues = validateLetter(v.document as LetterDocument, dictionary, (v.savedRules ?? []) as SavedRule[], v.knownImageIds ? { knownImageIds: new Set<string>(v.knownImageIds) } : {});
      expect(issues.map((i) => `${i.severity}:${i.code}`).sort()).toEqual(v.expect);
    });
  }
});

describe("letter-spec markup", () => {
  const file = readJson("vectors/markup.json");
  for (const v of file.vectors) {
    it(v.name, () => {
      const r = parseMarkup(v.input);
      if (v.error) expect(r.error ?? "").toContain(v.error);
      else { expect(r.error).toBeUndefined(); expect(r.runs).toEqual(v.runs); }
    });
  }
});
