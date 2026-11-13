import { z } from "zod";

// Pure validation for the masters feature (no DB), so the rules are unit-testable. Routes load the
// rows and call these.

export const CODE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const ITEM_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

export const attributeDefSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,31}$/, "Attribute keys are letters and digits, starting with a letter."),
  label: z.object({ en: z.string().trim().min(1), he: z.string().trim().min(1) }),
  kind: z.enum(["text", "number", "boolean"]),
  required: z.boolean().optional(),
});
export type AttributeDef = z.infer<typeof attributeDefSchema>;
export const attributeDefsSchema = z.array(attributeDefSchema).max(20).superRefine((defs, ctx) => {
  const seen = new Set<string>();
  for (const d of defs) {
    if (seen.has(d.key)) ctx.addIssue({ code: "custom", message: `Duplicate attribute key "${d.key}".` });
    seen.add(d.key);
  }
});

/** Checks item attributes against the type's definitions. Returns the cleaned object or an error. */
export function validateAttributes(
  defs: AttributeDef[],
  attrs: Record<string, unknown> | undefined,
): { ok: true; value: Record<string, string | number | boolean> } | { ok: false; message: string } {
  const input = attrs ?? {};
  const out: Record<string, string | number | boolean> = {};
  const known = new Set(defs.map((d) => d.key));
  for (const k of Object.keys(input)) {
    if (!known.has(k)) return { ok: false, message: `Unknown attribute "${k}".` };
  }
  for (const d of defs) {
    const v = input[d.key];
    const empty = v === undefined || v === null || v === "";
    if (empty) {
      if (d.required) return { ok: false, message: `${d.label.en} is required.` };
      continue;
    }
    if (d.kind === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return { ok: false, message: `${d.label.en} must be a number.` };
      out[d.key] = n;
    } else if (d.kind === "boolean") {
      if (typeof v !== "boolean") return { ok: false, message: `${d.label.en} must be true or false.` };
      out[d.key] = v;
    } else {
      if (typeof v !== "string") return { ok: false, message: `${d.label.en} must be text.` };
      out[d.key] = v.trim();
    }
  }
  return { ok: true, value: out };
}

/** True if making `parentId` the parent of `selfId` would create a cycle (parent chain reaches self). */
export function createsCycle(selfId: number, parentId: number | null, parentOf: (id: number) => number | null | undefined): boolean {
  let cur: number | null | undefined = parentId;
  const seen = new Set<number>();
  while (cur != null) {
    if (cur === selfId) return true;
    if (seen.has(cur)) return true; // pre-existing loop: refuse to extend it
    seen.add(cur);
    cur = parentOf(cur);
  }
  return false;
}

/** Type-level cycle check: a type's parent chain must not reach itself. */
export function typeCreatesCycle(code: string, parentTypeCode: string | null, parentTypeOf: (c: string) => string | null | undefined): boolean {
  let cur: string | null | undefined = parentTypeCode;
  const seen = new Set<string>();
  while (cur != null) {
    if (cur === code) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = parentTypeOf(cur);
  }
  return false;
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ---- Generated codes --------------------------------------------------------------------------------
// Nobody types a code: it is derived from the English name so the same name always yields the same
// code in every database, and two admins cannot invent HRH / HIS_ROYAL / H_R_H for one title.

export const MAX_CODE_LENGTH = 30;

/** English name -> upper-snake base: accents stripped, "&" read as AND, anything else non-alphanumeric
 * becomes "_". Not length-limited and not de-duplicated: see {@link generateCode}. */
export function normaliseName(name: string): string {
  return name
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " AND ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Cuts to `max` characters, preferring a word boundary so "COMMERCIAL_PROPERTY_FINANCING_FACILITY"
 * becomes "COMMERCIAL_PROPERTY_FINANCING" rather than ending mid-word. */
function truncate(base: string, max: number): string {
  if (base.length <= max) return base;
  const cut = base.slice(0, max);
  const boundary = cut.lastIndexOf("_");
  return (boundary >= 4 ? cut.slice(0, boundary) : cut).replace(/_+$/g, "");
}

/**
 * Generates a unique code for a new item or master type from its English name.
 *  - `isTaken` tells whether a candidate already exists in the same scope.
 *  - On a clash a numeric suffix is added (_2, _3 ...), and the base is shortened so the result still
 *    fits the length limit.
 *  - Names with no Latin letters or digits (e.g. Arabic only) fall back to `fallback` + a number.
 * Item codes are upper-snake; pass `lower: true` for master types, whose codes are lower-snake.
 */
export function generateCode(
  name: string,
  isTaken: (candidate: string) => boolean,
  opts: { max?: number; lower?: boolean; fallback?: string } = {},
): string {
  const max = opts.max ?? MAX_CODE_LENGTH;
  const base = truncate(normaliseName(name), max) || (opts.fallback ?? "ITEM");
  const fmt = (v: string) => (opts.lower ? v.toLowerCase() : v);
  if (!isTaken(fmt(base))) return fmt(base);
  for (let n = 2; n < 10_000; n++) {
    const suffix = `_${n}`;
    const candidate = fmt(truncate(base, max - suffix.length) + suffix);
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error("Could not generate a unique code");
}

/** English label -> camelCase attribute key ("Branch code" -> "branchCode"), unique within `taken`. */
export function generateAttributeKey(label: string, taken: Set<string>): string {
  const words = normaliseName(label).split("_").filter(Boolean).slice(0, 4);
  let key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0] + w.slice(1).toLowerCase())).join("");
  if (!/^[a-z]/.test(key)) key = `field${key ? key[0].toUpperCase() + key.slice(1) : ""}`;
  key = key.slice(0, 28);
  let candidate = key, n = 2;
  while (taken.has(candidate)) candidate = `${key}${n++}`;
  return candidate;
}
