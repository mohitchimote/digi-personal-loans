import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allowedActions, createCase, evaluate, queueAccess } from "../src/lib/workflow/engine";
import type { Actor, CaseState, Facts, WorkflowDefinition } from "../src/lib/workflow/types";

// Runs workflow-spec/vectors/*.json against the Worker engine. The Java workflow-service runs the
// same files; see workflow-spec/README.md for the contract and the matching rules.

const specDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../workflow-spec");
const readJson = (p: string) => JSON.parse(readFileSync(resolve(specDir, p), "utf8"));

interface Fixtures {
  now: string;
  actors: Record<string, Actor>;
  ladder: Facts["ladder"];
  cases: Record<string, CaseState>;
  defaultFacts: Omit<Facts, "ladder">;
}
const fixtures: Fixtures = readJson("vectors/fixtures.json");

function deepMerge<T>(base: T, over: unknown): T {
  if (over === undefined) return structuredClone(base);
  if (over === null || typeof over !== "object" || Array.isArray(over) || typeof base !== "object" || base === null) return over as T;
  const out: Record<string, unknown> = { ...(structuredClone(base) as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = deepMerge((out as Record<string, unknown>)[k], v);
  return out as T;
}

/** Partial match: every key in `expected` must equal `actual`, recursively; arrays match whole. */
function matches(actual: unknown, expected: unknown, path = "$"): string | null {
  if (expected === null || typeof expected !== "object") return Object.is(actual, expected) || actual === expected ? null : `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${path}: expected an array, got ${JSON.stringify(actual)}`;
    if (actual.length !== expected.length) return `${path}: expected ${expected.length} item(s), got ${actual.length}: ${JSON.stringify(actual)}`;
    for (let i = 0; i < expected.length; i++) { const r = matches(actual[i], expected[i], `${path}[${i}]`); if (r) return r; }
    return null;
  }
  if (actual === null || typeof actual !== "object") return `${path}: expected an object, got ${JSON.stringify(actual)}`;
  for (const [k, v] of Object.entries(expected as Record<string, unknown>)) {
    const r = matches((actual as Record<string, unknown>)[k], v, `${path}.${k}`);
    if (r) return r;
  }
  return null;
}

interface Vector {
  name: string;
  kind: "transition" | "create" | "actions" | "queue";
  case?: string;
  caseOverrides?: unknown;
  action?: string;
  actor?: string;
  input?: Record<string, unknown>;
  facts?: Partial<Facts>;
  entry?: string;
  queue?: string;
  expect: unknown;
}

function run(def: WorkflowDefinition, v: Vector): unknown {
  const facts: Facts = { ...fixtures.defaultFacts, ...(v.facts ?? {}), ladder: fixtures.ladder };
  switch (v.kind) {
    case "create": return createCase(def, v.entry!);
    case "queue": return queueAccess(def, { actor: fixtures.actors[v.actor!], queue: v.queue! });
    case "actions": return allowedActions(def, { case: deepMerge(fixtures.cases[v.case!], v.caseOverrides), actor: fixtures.actors[v.actor!], facts });
    case "transition":
      return evaluate(def, {
        case: deepMerge(fixtures.cases[v.case!], v.caseOverrides),
        request: { action: v.action!, actor: fixtures.actors[v.actor!], input: v.input, now: fixtures.now },
        facts,
      });
  }
}

const files = readdirSync(resolve(specDir, "vectors")).filter((f) => f.endsWith(".json") && f !== "fixtures.json").sort();

describe("workflow-spec conformance vectors (Worker engine)", () => {
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const doc = readJson(`vectors/${file}`) as { definition: string; vectors: Vector[] };
    const def = readJson(doc.definition) as WorkflowDefinition;
    describe(file, () => {
      for (const v of doc.vectors) {
        it(v.name, () => {
          const mismatch = matches(run(def, v), v.expect);
          expect(mismatch, `${v.name}\n${mismatch}`).toBeNull();
        });
      }
    });
  }
});
