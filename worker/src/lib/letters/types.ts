import { z } from "zod";

// The letter document model. The language-neutral definition is letter-spec/ (README + JSON Schema);
// this file is the Worker's typed copy and its runtime validator. Keep the three in step.

export const LANGS = ["en", "he"] as const;
export type Lang = (typeof LANGS)[number];

export const bilingual = z.object({ en: z.string(), he: z.string() }).strict();
export type Bilingual = z.infer<typeof bilingual>;

export const FIELD_TYPES = ["text", "number", "money", "percent", "date", "bool", "choice", "list"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const OPERATORS = [
  "eq", "ne", "contains", "in", "empty", "notEmpty", "gt", "gte", "lt", "lte", "between",
  "isYes", "isNo", "before", "after", "withinDays", "ageAtLeast", "ageBelow", "anyMatch", "noneMatch",
] as const;
export type Operator = (typeof OPERATORS)[number];

/** Right-hand side of a condition: a literal, another field's value, or today's date. */
export const rhs = z.object({
  k: z.enum(["value", "field", "today"]),
  v: z.union([z.string(), z.number(), z.boolean()]).optional(),
  v2: z.number().optional(),
  list: z.array(z.string()).optional(),
}).strict();
export type Rhs = z.infer<typeof rhs>;

export interface ConditionRule { t: "condition"; field: string; op: Operator; rhs?: Rhs; nested?: GroupRule }
export interface GroupRule { t: "group"; op: "all" | "any"; not?: boolean; items: Rule[] }
export interface RefRule { t: "ref"; id: string }
export type Rule = ConditionRule | GroupRule | RefRule;

export const rule: z.ZodType<Rule> = z.lazy(() =>
  z.union([
    z.object({ t: z.literal("condition"), field: z.string(), op: z.enum(OPERATORS), rhs: rhs.optional(), nested: groupRule.optional() }).strict(),
    groupRule,
    z.object({ t: z.literal("ref"), id: z.string() }).strict(),
  ]),
);
const groupRule: z.ZodType<GroupRule> = z.lazy(() =>
  z.object({ t: z.literal("group"), op: z.enum(["all", "any"]), not: z.boolean().optional(), items: z.array(rule) }).strict(),
);

export interface SavedRule { id: string; name: string; rule: Rule }
export const savedRule = z.object({ id: z.string(), name: z.string(), rule }).strict();

// ---- document nodes

export const ALIGNS = ["start", "center", "end"] as const;
export type Align = (typeof ALIGNS)[number];
export const MAX_INDENT = 4, MAX_LIST_LEVEL = 2;
const align = z.enum(ALIGNS);
const indent = z.number().int().min(0).max(MAX_INDENT);
/** A bullet or numbered point: bilingual text and how far it is indented (0 to 2). */
export const listItem = bilingual.extend({ level: z.number().int().min(0).max(MAX_LIST_LEVEL).optional() }).strict();
export type ListItem = z.infer<typeof listItem>;

export type LetterNode =
  | { id: string; t: "heading"; text: Bilingual; level?: 1 | 2 | 3; align?: Align; indent?: number }
  | { id: string; t: "paragraph"; text: Bilingual; align?: Align; indent?: number }
  | { id: string; t: "list"; ordered?: boolean; items: ListItem[] }
  | { id: string; t: "table"; rows: { label: Bilingual; value: Bilingual }[] }
  | { id: string; t: "image"; imageId?: string; kind?: string; alt: Bilingual }
  | { id: string; t: "signature"; imageId?: string; caption: Bilingual }
  | { id: string; t: "when"; rule: Rule | null; children: LetterNode[] }
  | { id: string; t: "repeat"; over: string; where: Rule | null; children: LetterNode[] }
  | { id: string; t: "alternatives"; variants: { rule: Rule | null; children: LetterNode[] }[] };

export const node: z.ZodType<LetterNode> = z.lazy(() =>
  z.discriminatedUnion("t", [
    z.object({ id: z.string(), t: z.literal("heading"), text: bilingual, level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(), align: align.optional(), indent: indent.optional() }).strict(),
    z.object({ id: z.string(), t: z.literal("paragraph"), text: bilingual, align: align.optional(), indent: indent.optional() }).strict(),
    z.object({ id: z.string(), t: z.literal("list"), ordered: z.boolean().optional(), items: z.array(listItem) }).strict(),
    z.object({ id: z.string(), t: z.literal("table"), rows: z.array(z.object({ label: bilingual, value: bilingual }).strict()) }).strict(),
    z.object({ id: z.string(), t: z.literal("image"), imageId: z.string().optional(), kind: z.string().optional(), alt: bilingual }).strict(),
    z.object({ id: z.string(), t: z.literal("signature"), imageId: z.string().optional(), caption: bilingual }).strict(),
    z.object({ id: z.string(), t: z.literal("when"), rule: rule.nullable(), children: z.array(node) }).strict(),
    z.object({ id: z.string(), t: z.literal("repeat"), over: z.string(), where: rule.nullable(), children: z.array(node) }).strict(),
    z.object({ id: z.string(), t: z.literal("alternatives"), variants: z.array(z.object({ rule: rule.nullable(), children: z.array(node) }).strict()) }).strict(),
  ]),
);

export interface LetterDocument { formatVersion: 1; header: LetterNode[]; body: LetterNode[]; footer: LetterNode[] }
export const letterDocument: z.ZodType<LetterDocument> = z.object({
  formatVersion: z.literal(1),
  header: z.array(node), body: z.array(node), footer: z.array(node),
}).strict();

// ---- data dictionary

export interface Choice { v: string; en: string; he: string }
export interface FieldMeta {
  label: Bilingual;
  type: FieldType;
  /** Default format for a token that names none. Defaults by type: number int, money money, percent pct, date date, bool yesno. */
  fmt?: string;
  choices?: Choice[];
  /** For type "list": the fields of each item, referenced in a repeat or an item-match as `item.<key>`. */
  itemFields?: Record<string, Omit<FieldMeta, "itemFields">>;
}
export interface Dictionary { formatVersion: 1; fields: Record<string, FieldMeta> }

// ---- resolved output (what renderers draw)

export type Block =
  | { type: "heading"; text: string; level?: 1 | 2 | 3; align?: Align; indent?: number }
  | { type: "paragraph"; text: string; align?: Align; indent?: number }
  | { type: "list"; items: string[]; ordered?: true; levels?: number[] }
  | { type: "table"; rows: { label: string; value: string }[] }
  | { type: "image"; imageId?: string; kind?: string; alt: string }
  | { type: "signature"; imageId?: string; caption: string };

export interface Decision { nodeId: string; kind: "when" | "repeat" | "alternatives"; shown: boolean; variant?: number; items?: number }

export interface ResolvedLetter {
  lang: Lang;
  header: Block[]; body: Block[]; footer: Block[];
  /** Language-independent: what was shown and why it matters for the audit trail. */
  decisions: Decision[];
  /** Fields a token named that had no value; a letter with any of these should not be issued. */
  missing: string[];
}
