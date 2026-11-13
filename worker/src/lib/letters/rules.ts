import type { ConditionRule, Dictionary, FieldMeta, GroupRule, Rule, SavedRule } from "./types";

// Evaluation of rules against data. Semantics are normative and written up in letter-spec/README.md;
// the Java engine implements the same and runs letter-spec/vectors/rules.json.

export interface EvalContext {
  data: Record<string, unknown>;
  /** The date the letter is issued, "YYYY-MM-DD". Passed in, never read from a clock, so results repeat. */
  today: string;
  dictionary: Dictionary;
  saved: ReadonlyMap<string, SavedRule>;
  /** The current list entry inside a repeat or an item match, and the list it belongs to. */
  item?: Record<string, unknown>;
  list?: string;
}

export const isMissing = (v: unknown): boolean => v === undefined || v === null || v === "";

/** Looks a dotted path up in the data. `today` is the issue date; `<list>.count` is a list's length; `item.<key>` is the current entry. */
export function getPath(path: string, ctx: EvalContext): unknown {
  if (path === "today") return ctx.today;
  if (path.startsWith("item.")) return ctx.item?.[path.slice(5)];
  let v: unknown = ctx.data;
  for (const k of path.split(".")) {
    if (v === undefined || v === null) return undefined;
    if (k === "count" && Array.isArray(v)) return v.length;
    v = (v as Record<string, unknown>)[k];
  }
  return v;
}

/** What the dictionary says about a path, including `<list>.count` and `item.<key>`. */
export function metaOf(path: string, ctx: Pick<EvalContext, "dictionary" | "list">): FieldMeta | undefined {
  if (path === "today") return { label: { en: "Today", he: "היום" }, type: "date" };
  if (path.startsWith("item.")) {
    const f = ctx.list ? ctx.dictionary.fields[ctx.list]?.itemFields?.[path.slice(5)] : undefined;
    return f as FieldMeta | undefined;
  }
  const direct = ctx.dictionary.fields[path];
  if (direct) return direct;
  if (path.endsWith(".count") && ctx.dictionary.fields[path.slice(0, -6)]?.type === "list") return { label: { en: "Number of items", he: "מספר פריטים" }, type: "number" };
  return undefined;
}

// ---- dates (UTC, whole days; no time zones)

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
function dayNumber(iso: unknown): number | null {
  const m = typeof iso === "string" ? ISO.exec(iso) : null;
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) : null;
}
export function ageInYears(dob: unknown, today: string): number | null {
  const b = typeof dob === "string" ? ISO.exec(dob) : null, t = ISO.exec(today);
  if (!b || !t) return null;
  let age = Number(t[1]) - Number(b[1]);
  if (Number(t[2]) < Number(b[2]) || (Number(t[2]) === Number(b[2]) && Number(t[3]) < Number(b[3]))) age--;
  return age;
}

// ---- comparison helpers

/** A bilingual value ({en, he}) compares as its English text. */
const plain = (v: unknown): unknown => (typeof v === "object" && v !== null && !Array.isArray(v) && "en" in (v as object) ? (v as { en: unknown }).en : v);

const isNumeric = (v: unknown): boolean => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));
function equal(a: unknown, b: unknown): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b);
  if (isNumeric(a) && isNumeric(b)) return Number(a) === Number(b);
  return String(a) === String(b);
}
function rhsValue(c: ConditionRule, ctx: EvalContext): unknown {
  const r = c.rhs;
  if (!r) return undefined;
  if (r.k === "today") return ctx.today;
  if (r.k === "field") return typeof r.v === "string" ? getPath(r.v, ctx) : undefined;
  return r.v;
}

/**
 * Evaluates one condition. A comparison whose value, or whose compared value, is missing is false
 * (unknown never counts as a match), except the explicit empty / not-empty tests. A missing list counts
 * as an empty list.
 */
export function evalCondition(c: ConditionRule, ctx: EvalContext, depth = 0): boolean {
  const lv = plain(getPath(c.field, ctx));
  if (c.op === "empty") return isMissing(lv) || (Array.isArray(lv) && lv.length === 0);
  if (c.op === "notEmpty") return !(isMissing(lv) || (Array.isArray(lv) && lv.length === 0));
  if (c.op === "anyMatch" || c.op === "noneMatch") {
    const list = Array.isArray(lv) ? (lv as Record<string, unknown>[]) : [];
    const any = list.some((it) => (c.nested ? evalGroup(c.nested, { ...ctx, item: it, list: c.field }, depth + 1) : true));
    return c.op === "anyMatch" ? any : !any;
  }
  if (isMissing(lv)) return false;
  const rv = plain(rhsValue(c, ctx));
  switch (c.op) {
    case "isYes": return lv === true;
    case "isNo": return lv === false;
    case "in": return (c.rhs?.list ?? []).includes(String(lv));
    case "between": return isNumeric(lv) && typeof c.rhs?.v === "number" && typeof c.rhs?.v2 === "number" && Number(lv) >= c.rhs.v && Number(lv) <= c.rhs.v2;
    case "withinDays": {
      const a = dayNumber(lv), t = dayNumber(ctx.today);
      return a !== null && t !== null && typeof c.rhs?.v === "number" && Math.abs(a - t) <= c.rhs.v;
    }
    case "ageAtLeast": case "ageBelow": {
      const age = ageInYears(lv, ctx.today);
      if (age === null || typeof c.rhs?.v !== "number") return false;
      return c.op === "ageAtLeast" ? age >= c.rhs.v : age < c.rhs.v;
    }
  }
  if (isMissing(rv)) return false;
  switch (c.op) {
    case "eq": return equal(lv, rv);
    case "ne": return !equal(lv, rv);
    case "gt": return isNumeric(lv) && isNumeric(rv) && Number(lv) > Number(rv);
    case "gte": return isNumeric(lv) && isNumeric(rv) && Number(lv) >= Number(rv);
    case "lt": return isNumeric(lv) && isNumeric(rv) && Number(lv) < Number(rv);
    case "lte": return isNumeric(lv) && isNumeric(rv) && Number(lv) <= Number(rv);
    case "contains": return String(lv).toLowerCase().includes(String(rv).toLowerCase());
    case "before": { const a = dayNumber(lv), b = dayNumber(rv); return a !== null && b !== null && a < b; }
    case "after": { const a = dayNumber(lv), b = dayNumber(rv); return a !== null && b !== null && a > b; }
  }
  return false;
}

const MAX_DEPTH = 20;

/** A group is met when all (or any) of its items are; an empty group is met; `not` flips the result. */
export function evalGroup(g: GroupRule, ctx: EvalContext, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  let ok = g.items.length === 0 ? true : g.op === "all" ? g.items.every((i) => evalRule(i, ctx, depth + 1)) : g.items.some((i) => evalRule(i, ctx, depth + 1));
  if (g.not) ok = !ok;
  return g.items.length === 0 ? true : ok;
}

/** `null` (no rule) is always met. A reference to a saved rule that does not exist is not met. */
export function evalRule(r: Rule | null | undefined, ctx: EvalContext, depth = 0): boolean {
  if (!r) return true;
  if (depth > MAX_DEPTH) return false;
  if (r.t === "condition") return evalCondition(r, ctx, depth);
  if (r.t === "ref") { const s = ctx.saved.get(r.id); return s ? evalRule(s.rule, ctx, depth + 1) : false; }
  return evalGroup(r, ctx, depth);
}
