import { evalRule, getPath, isMissing, metaOf, type EvalContext } from "./rules";
import { formatValue } from "./formats";
import type { Block, Decision, LetterDocument, LetterNode, Lang, ResolvedLetter, Dictionary, SavedRule } from "./types";

// Turns a letter document and the data of one application into the text that is printed, in one language.
// Pure: no clock, no database. Renderers (the Worker's pdf-lib one, Java's) only draw the result, so the
// two implementations can be proven alike by comparing this output. See letter-spec/README.md.

export interface ResolveInput {
  document: LetterDocument;
  dictionary: Dictionary;
  savedRules?: SavedRule[];
  data: Record<string, unknown>;
  /** Issue date, "YYYY-MM-DD". */
  today: string;
}

const TOKEN = /\{\{\s*([\w.]+)(?:\|(\w+))?\s*\}\}/g;

/** Page numbers are only known when the PDF is laid out, so these tokens pass through untouched. */
const PAGE_TOKENS = new Set(["page.number", "page.total"]);

function fillTokens(text: string, ctx: EvalContext, lang: Lang, missing: Set<string>): string {
  return text.replace(TOKEN, (all, path: string, fmt?: string) => {
    if (PAGE_TOKENS.has(path)) return all;
    const value = getPath(path, ctx);
    if (isMissing(value)) { missing.add(path); return ""; }
    return formatValue(value, metaOf(path, ctx), fmt, lang);
  });
}

function repeatItems(over: string, where: LetterNode & { t: "repeat" }, ctx: EvalContext): Record<string, unknown>[] {
  const raw = getPath(over, ctx);
  const items = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  return items.filter((it) => evalRule(where.where, { ...ctx, item: it, list: over }));
}

export function resolveLetter(input: ResolveInput, lang: Lang): ResolvedLetter {
  const saved = new Map((input.savedRules ?? []).map((s) => [s.id, s]));
  const base: EvalContext = { data: input.data, today: input.today, dictionary: input.dictionary, saved };
  const decisions: Decision[] = [], missing = new Set<string>();

  const walk = (nodes: LetterNode[], ctx: EvalContext, out: Block[], record: boolean): void => {
    for (const n of nodes) {
      const text = (b: { en: string; he: string }) => fillTokens(b[lang], ctx, lang, missing);
      switch (n.t) {
        case "heading": out.push({ type: "heading", text: text(n.text) }); break;
        case "paragraph": out.push({ type: "paragraph", text: text(n.text) }); break;
        case "list": out.push({ type: "list", items: n.items.map(text) }); break;
        case "table": out.push({ type: "table", rows: n.rows.map((r) => ({ label: text(r.label), value: text(r.value) })) }); break;
        case "image": out.push({ type: "image", ...(n.imageId ? { imageId: n.imageId } : {}), ...(n.kind ? { kind: n.kind } : {}), alt: text(n.alt) }); break;
        case "signature": out.push({ type: "signature", ...(n.imageId ? { imageId: n.imageId } : {}), caption: text(n.caption) }); break;
        case "when": {
          const shown = evalRule(n.rule, ctx);
          if (record) decisions.push({ nodeId: n.id, kind: "when", shown });
          if (shown) walk(n.children, ctx, out, record);
          break;
        }
        case "repeat": {
          const items = repeatItems(n.over, n, ctx);
          if (record) decisions.push({ nodeId: n.id, kind: "repeat", shown: items.length > 0, items: items.length });
          items.forEach((it) => walk(n.children, { ...ctx, item: it, list: n.over }, out, false));
          break;
        }
        case "alternatives": {
          const i = n.variants.findIndex((v) => evalRule(v.rule, ctx));
          if (record) decisions.push({ nodeId: n.id, kind: "alternatives", shown: i >= 0, ...(i >= 0 ? { variant: i } : {}) });
          if (i >= 0) walk(n.variants[i].children, ctx, out, record);
          break;
        }
      }
    }
  };

  const header: Block[] = [], body: Block[] = [], footer: Block[] = [];
  walk(input.document.header, base, header, true);
  walk(input.document.body, base, body, true);
  walk(input.document.footer, base, footer, true);
  return { lang, header, body, footer, decisions, missing: [...missing].sort() };
}

/** Both languages. Which parts appear is decided once from the data, so they cannot disagree. */
export function resolveBoth(input: ResolveInput): { en: ResolvedLetter; he: ResolvedLetter } {
  return { en: resolveLetter(input, "en"), he: resolveLetter(input, "he") };
}
