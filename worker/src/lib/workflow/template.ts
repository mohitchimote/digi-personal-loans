import type { Condition } from "./types";

// Pure helpers for definition templates ("{{input.reason}}") and `when` conditions. Both engines
// implement the same rules (workflow-spec/README.md, "Templates" and "Conditions").

export type TemplateContext = Record<string, unknown>;

function getPath(ctx: TemplateContext, path: string): unknown {
  let cur: unknown = ctx;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const WHOLE = /^\{\{([A-Za-z0-9_.]+)\}\}$/;
const EACH = /\{\{([A-Za-z0-9_.]+)\}\}/g;

/** A string that is exactly one placeholder resolves to the typed value (missing -> null). Any
 * other string is interpolated as text (null/missing -> ""). Non-strings pass through. */
export function resolveTemplate(value: unknown, ctx: TemplateContext): unknown {
  if (typeof value !== "string") return value;
  const whole = WHOLE.exec(value);
  if (whole) {
    const v = getPath(ctx, whole[1]);
    return v === undefined ? null : v;
  }
  return value.replace(EACH, (_m, path: string) => {
    const v = getPath(ctx, path);
    return v === null || v === undefined ? "" : String(v);
  });
}

export function resolveVars(vars: Record<string, unknown> | undefined, ctx: TemplateContext): Record<string, unknown> | undefined {
  if (!vars) return undefined;
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, resolveTemplate(v, ctx)]));
}

export function evalCondition(cond: Condition, ctx: TemplateContext): boolean {
  if ("all" in cond) return cond.all.every((c) => evalCondition(c, ctx));
  if ("any" in cond) return cond.any.some((c) => evalCondition(c, ctx));
  if ("not" in cond) return !evalCondition(cond.not, ctx);
  const v = getPath(ctx, cond.fact);
  switch (cond.op) {
    case "eq": return v === cond.value;
    case "ne": return v !== cond.value;
    case "truthy": return !!v;
    case "falsy": return !v;
    case "in": return Array.isArray(cond.value) && cond.value.includes(v);
  }
}
