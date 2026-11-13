import { metaOf } from "./rules";
import { parseMarkup, plainText } from "./markup";
import type { Dictionary, FieldType, LetterDocument, LetterNode, Operator, Rule, SavedRule } from "./types";

// Checks a letter template before it can be saved as ready or published: every field it names exists, every
// condition makes sense for the field's type, saved-rule references resolve and do not loop, and the two
// languages agree. Pure, so Java can run the same checks against letter-spec/vectors/validate.json.
// `error` blocks publishing; `warning` is shown but allowed.

export interface LetterIssue {
  severity: "error" | "warning";
  /** Stable machine code, the same in every implementation. */
  code: string;
  message: string;
  /** The node it concerns, when there is one. */
  nodeId?: string;
}

const TOKEN = /\{\{\s*([\w.]+)(?:\|(\w+))?\s*\}\}/g;
const PAGE_TOKENS = new Set(["page.number", "page.total"]);
const FORMATS = ["int", "dec", "money", "money2", "pct", "term", "date", "yesno"] as const;
const FORMATS_FOR: Record<string, FieldType[]> = {
  int: ["number", "money", "percent"], dec: ["number", "money", "percent"], money: ["number", "money"], money2: ["number", "money"],
  pct: ["number", "percent"], term: ["number"], date: ["date"], yesno: ["bool"],
};
const MAX_DEPTH = 20;

const OPS_BY_TYPE: Record<FieldType, Operator[]> = {
  text: ["eq", "ne", "contains", "in", "empty", "notEmpty"],
  number: ["eq", "ne", "gt", "gte", "lt", "lte", "between", "empty", "notEmpty"],
  money: ["eq", "ne", "gt", "gte", "lt", "lte", "between", "empty", "notEmpty"],
  percent: ["eq", "ne", "gt", "gte", "lt", "lte", "between", "empty", "notEmpty"],
  date: ["eq", "ne", "before", "after", "withinDays", "ageAtLeast", "ageBelow", "empty", "notEmpty"],
  bool: ["isYes", "isNo", "empty", "notEmpty"],
  choice: ["eq", "ne", "in", "empty", "notEmpty"],
  list: ["empty", "notEmpty", "anyMatch", "noneMatch"],
};
const NEEDS_VALUE: Operator[] = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "before", "after"];

export function validateLetter(doc: LetterDocument, dictionary: Dictionary, savedRules: SavedRule[] = [], opts: { knownImageIds?: ReadonlySet<string> } = {}): LetterIssue[] {
  const issues: LetterIssue[] = [];
  const add = (severity: LetterIssue["severity"], code: string, message: string, nodeId?: string) => issues.push({ severity, code, message, ...(nodeId ? { nodeId } : {}) });
  const saved = new Map(savedRules.map((s) => [s.id, s]));
  const seen = new Set<string>();

  // ---- rules
  function checkRule(r: Rule | null | undefined, list: string | undefined, nodeId: string | undefined, depth: number, refPath: string[]): void {
    if (!r) return;
    if (depth > MAX_DEPTH) { add("error", "rule.tooDeep", `A condition is nested more than ${MAX_DEPTH} levels deep.`, nodeId); return; }
    if (r.t === "group") {
      if (r.items.length === 0) add("warning", "rule.emptyGroup", "A condition group with nothing in it is always met.", nodeId);
      r.items.forEach((i) => checkRule(i, list, nodeId, depth + 1, refPath));
      return;
    }
    if (r.t === "ref") {
      const target = saved.get(r.id);
      if (!target) { add("error", "rule.refMissing", `The saved rule "${r.id}" does not exist.`, nodeId); return; }
      if (refPath.includes(r.id)) { add("error", "rule.refCycle", `Saved rules refer to each other in a loop (${[...refPath, r.id].join(" → ")}).`, nodeId); return; }
      checkRule(target.rule, list, nodeId, depth + 1, [...refPath, r.id]);
      return;
    }
    const meta = fieldMeta(r.field, list, nodeId);
    if (!meta) return;
    const ok = OPS_BY_TYPE[meta.type];
    if (!ok.includes(r.op)) { add("error", "rule.opType", `"${r.op}" cannot be used on "${r.field}", which is ${meta.type === "list" ? "a list" : "a " + meta.type + " field"}.`, nodeId); return; }
    const rhs = r.rhs;
    if (NEEDS_VALUE.includes(r.op)) {
      const has = rhs && (rhs.k === "today" || (rhs.k === "field" ? typeof rhs.v === "string" && rhs.v !== "" : rhs.v !== undefined && rhs.v !== ""));
      if (!has) add("error", "rule.valueMissing", `The condition on "${r.field}" is missing the value to compare with.`, nodeId);
    }
    if (rhs?.k === "field" && typeof rhs.v === "string" && rhs.v) {
      const other = fieldMeta(rhs.v, list, nodeId);
      if (other && other.type !== meta.type && !(isNum(other.type) && isNum(meta.type))) {
        add("error", "rule.compareTypes", `"${r.field}" (${meta.type}) is compared with "${rhs.v}" (${other.type}).`, nodeId);
      }
    }
    if (r.op === "in" && !(rhs?.list && rhs.list.length)) add("error", "rule.valueMissing", `The condition on "${r.field}" needs at least one value in its list.`, nodeId);
    if (r.op === "between") {
      if (typeof rhs?.v !== "number" || typeof rhs?.v2 !== "number") add("error", "rule.valueMissing", `The "between" condition on "${r.field}" needs two numbers.`, nodeId);
      else if (rhs.v > rhs.v2) add("error", "rule.betweenOrder", `The "between" condition on "${r.field}" has its numbers the wrong way round.`, nodeId);
    }
    if (["withinDays", "ageAtLeast", "ageBelow"].includes(r.op) && typeof rhs?.v !== "number") add("error", "rule.valueMissing", `The condition on "${r.field}" needs a number.`, nodeId);
    if (meta.type === "choice" && meta.choices && (r.op === "eq" || r.op === "ne" || r.op === "in")) {
      const values = r.op === "in" ? rhs?.list ?? [] : rhs?.k === "value" && rhs.v !== undefined ? [String(rhs.v)] : [];
      for (const v of values) if (!meta.choices.some((c) => c.v === v)) add("error", "rule.choiceUnknown", `"${v}" is not one of the choices of "${r.field}".`, nodeId);
    }
    if (r.op === "anyMatch" || r.op === "noneMatch") {
      if (!r.nested) add("warning", "rule.noMatchCondition", `"${r.op}" on "${r.field}" has no condition for the entries, so it only tests whether the list has any.`, nodeId);
      else checkRule(r.nested, r.field, nodeId, depth + 1, refPath);
    } else if (r.nested) add("error", "rule.nestedNotList", `Only list conditions can have a condition for their entries.`, nodeId);
  }
  const isNum = (t: FieldType) => t === "number" || t === "money" || t === "percent";

  function fieldMeta(path: string, list: string | undefined, nodeId: string | undefined) {
    if (path.startsWith("item.")) {
      if (!list) { add("error", "field.itemOutsideList", `"${path}" can only be used inside a repeat or a list condition.`, nodeId); return undefined; }
      const m = metaOf(path, { dictionary, list });
      if (!m) add("error", "field.unknown", `"${path}" is not a field of the list "${list}".`, nodeId);
      return m;
    }
    const m = metaOf(path, { dictionary, list });
    if (!m) add("error", "field.unknown", `"${path}" is not in the data dictionary.`, nodeId);
    return m;
  }

  // ---- text
  function checkText(en: string, he: string, list: string | undefined, zone: "header" | "body" | "footer", nodeId: string): void {
    const tokens = (t: string) => [...t.matchAll(TOKEN)].map((m) => ({ path: m[1], fmt: m[2] }));
    const inEn = tokens(en), inHe = tokens(he);
    for (const { path, fmt } of [...inEn, ...inHe]) {
      if (PAGE_TOKENS.has(path)) {
        if (zone === "body") add("warning", "token.pageInBody", `{{${path}}} only means something in the header or footer.`, nodeId);
        continue;
      }
      const meta = fieldMeta(path, list, nodeId);
      if (fmt) {
        if (!(FORMATS as readonly string[]).includes(fmt)) add("error", "token.formatUnknown", `"${fmt}" is not a format (${FORMATS.join(", ")}).`, nodeId);
        else if (meta && !FORMATS_FOR[fmt].includes(meta.type)) add("error", "token.formatType", `The format "${fmt}" cannot be used on "${path}" (${meta.type}).`, nodeId);
      }
      if (meta?.type === "list") add("error", "token.list", `"${path}" is a list; use a repeat block to print its entries.`, nodeId);
    }
    for (const [lang, t] of [["English", en], ["Hebrew", he]] as const) {
      const m = parseMarkup(t);
      if (m.error) add("error", "text.markup", `${lang} text: ${m.error}.`, nodeId);
    }
    const key = (ts: { path: string }[]) => [...new Set(ts.map((t) => t.path))].sort().join("|");
    if (key(inEn) !== key(inHe)) add("warning", "text.tokensDiffer", "The English and Hebrew text do not use the same fields.", nodeId);
    const pe = plainText(en).trim(), ph = plainText(he).trim();
    if (!pe && ph) add("warning", "text.emptyEn", "The English text is empty.", nodeId);
    if (pe && !ph) add("warning", "text.emptyHe", "The Hebrew text is empty.", nodeId);
  }

  // ---- nodes
  function checkNodes(nodes: LetterNode[], zone: "header" | "body" | "footer", list: string | undefined): void {
    for (const n of nodes) {
      if (seen.has(n.id)) add("error", "node.duplicateId", `Two blocks share the id "${n.id}".`, n.id);
      seen.add(n.id);
      switch (n.t) {
        case "heading": case "paragraph": checkText(n.text.en, n.text.he, list, zone, n.id); break;
        case "list": n.items.forEach((i) => checkText(i.en, i.he, list, zone, n.id)); break;
        case "table": n.rows.forEach((r) => { checkText(r.label.en, r.label.he, list, zone, n.id); checkText(r.value.en, r.value.he, list, zone, n.id); }); break;
        case "image": case "signature":
          if (!n.imageId) add("warning", "image.missing", `This ${n.t} has no image chosen yet.`, n.id);
          else if (opts.knownImageIds && !opts.knownImageIds.has(n.imageId)) add("error", "image.unknown", `The image "${n.imageId}" does not exist.`, n.id);
          break;
        case "when":
          if (!n.rule) add("warning", "when.noRule", "A block with no condition is always shown; it does not need to be conditional.", n.id);
          checkRule(n.rule, list, n.id, 0, []);
          checkNodes(n.children, zone, list);
          break;
        case "repeat": {
          const meta = fieldMeta(n.over, list, n.id);
          if (meta && meta.type !== "list") { add("error", "repeat.notList", `"${n.over}" is not a list, so it cannot be repeated.`, n.id); }
          checkRule(n.where, meta?.type === "list" ? n.over : undefined, n.id, 0, []);
          checkNodes(n.children, zone, meta?.type === "list" ? n.over : undefined);
          break;
        }
        case "alternatives": {
          if (n.variants.length === 0) add("warning", "alternatives.empty", "This choice block has no variants.", n.id);
          n.variants.forEach((v, i) => {
            if (i < n.variants.length - 1 && !v.rule) add("warning", "alternatives.unreachable", `Variant ${i + 1} has no condition, so the variants after it can never be chosen.`, n.id);
            checkRule(v.rule, list, n.id, 0, []);
            checkNodes(v.children, zone, list);
          });
          break;
        }
      }
    }
  }
  checkNodes(doc.header, "header", undefined);
  checkNodes(doc.body, "body", undefined);
  checkNodes(doc.footer, "footer", undefined);

  // Saved rules are checked on their own too, so a bad one is caught even when no template uses it yet.
  for (const s of savedRules) {
    const before = issues.length;
    checkRule(s.rule, undefined, undefined, 0, [s.id]);
    for (let i = before; i < issues.length; i++) issues[i].message = `Saved rule "${s.name}": ${issues[i].message}`;
  }
  return dedupe(issues);
}

function dedupe(issues: LetterIssue[]): LetterIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => { const k = `${i.severity}|${i.code}|${i.nodeId ?? ""}|${i.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export const hasErrors = (issues: LetterIssue[]): boolean => issues.some((i) => i.severity === "error");
