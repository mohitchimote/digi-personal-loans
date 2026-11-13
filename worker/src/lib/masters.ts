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
