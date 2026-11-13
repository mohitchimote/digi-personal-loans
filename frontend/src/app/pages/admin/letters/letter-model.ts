import { Choice, Dictionary, FieldMeta, FieldType, LetterNode, Operator } from '../../../core/services/letters.service';

export const newId = (): string => 'n' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

export const OP_LABEL: Record<Operator, string> = {
  eq: 'is', ne: 'is not', contains: 'contains', in: 'is one of', empty: 'is empty', notEmpty: 'has a value',
  gt: 'is more than', gte: 'is at least', lt: 'is less than', lte: 'is at most', between: 'is between',
  isYes: 'is yes', isNo: 'is no', before: 'is before', after: 'is after', withinDays: 'is within (days of today)',
  ageAtLeast: 'is at least (years old)', ageBelow: 'is under (years old)', anyMatch: 'has an entry where', noneMatch: 'has no entry where',
};

/** Same table as the server's validator (letter-spec README, Validating). */
export const OPS_BY_TYPE: Record<FieldType, Operator[]> = {
  text: ['eq', 'ne', 'contains', 'in', 'empty', 'notEmpty'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty'],
  money: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty'],
  percent: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty'],
  date: ['eq', 'ne', 'before', 'after', 'withinDays', 'ageAtLeast', 'ageBelow', 'empty', 'notEmpty'],
  bool: ['isYes', 'isNo', 'empty', 'notEmpty'],
  choice: ['eq', 'ne', 'in', 'empty', 'notEmpty'],
  list: ['empty', 'notEmpty', 'anyMatch', 'noneMatch'],
};
export const NEEDS_VALUE: Operator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'before', 'after'];
export const NEEDS_NUMBER: Operator[] = ['withinDays', 'ageAtLeast', 'ageBelow'];

export interface FieldChoice { path: string; label: string; type: FieldType; group: string }

/** Everything a token or condition can name, in the current context: top-level fields, list counts and, inside a list, item.* */
export function fieldChoices(dict: Dictionary | null, list?: string, opts: { lists?: boolean; scalars?: boolean } = { lists: true, scalars: true }): FieldChoice[] {
  if (!dict) return [];
  const out: FieldChoice[] = [];
  if (list) {
    const items = dict.fields[list]?.itemFields ?? {};
    for (const [k, m] of Object.entries(items)) if (m.type !== 'list' && opts.scalars !== false) out.push({ path: 'item.' + k, label: m.label.en, type: m.type, group: 'This entry' });
  }
  for (const [path, m] of Object.entries(dict.fields)) {
    if (m.type === 'list') {
      if (opts.lists !== false) out.push({ path, label: m.label.en, type: 'list', group: 'Lists' });
      if (opts.scalars !== false) out.push({ path: path + '.count', label: `${m.label.en}: number of entries`, type: 'number', group: 'Lists' });
    } else if (opts.scalars !== false) {
      out.push({ path, label: m.label.en, type: m.type, group: groupName(path) });
    }
  }
  return out;
}
const GROUPS: Record<string, string> = { application: 'Application', customer: 'Customer', company: 'Company', loan: 'Loan', calculated: 'Calculated (stored on application)', product: 'Product', branch: 'Branch', guarantor: 'Guarantor', decision: 'Decision' };
const groupName = (path: string) => GROUPS[path.split('.')[0]] ?? 'Other';

export function metaFor(dict: Dictionary | null, path: string, list?: string): FieldMeta | undefined {
  if (!dict) return undefined;
  if (path === 'today') return { label: { en: 'Today', he: 'היום' }, type: 'date' };
  if (path.startsWith('item.')) return list ? dict.fields[list]?.itemFields?.[path.slice(5)] : undefined;
  if (dict.fields[path]) return dict.fields[path];
  if (path.endsWith('.count') && dict.fields[path.slice(0, -6)]?.type === 'list') return { label: { en: 'Number of entries', he: 'מספר פריטים' }, type: 'number' };
  return undefined;
}
export const choicesOf = (m: FieldMeta | undefined): Choice[] => m?.choices ?? [];

export const BLOCK_KINDS: { value: string; label: string }[] = [
  { value: 'heading', label: 'Heading' }, { value: 'paragraph', label: 'Paragraph' }, { value: 'list', label: 'Bullet list' },
  { value: 'table', label: 'Table (label / value rows)' }, { value: 'image', label: 'Picture' }, { value: 'signature', label: 'Signature' },
  { value: 'when', label: 'Show only if…' }, { value: 'repeat', label: 'Repeat for each entry…' }, { value: 'alternatives', label: 'Choose one of…' },
];

const bi = (): { en: string; he: string } => ({ en: '', he: '' });
export function newNode(kind: string): LetterNode {
  const id = newId();
  switch (kind) {
    case 'heading': return { id, t: 'heading', text: bi() };
    case 'paragraph': return { id, t: 'paragraph', text: bi() };
    case 'list': return { id, t: 'list', items: [bi()] };
    case 'table': return { id, t: 'table', rows: [{ label: bi(), value: bi() }] };
    case 'image': return { id, t: 'image', alt: bi() };
    case 'signature': return { id, t: 'signature', caption: bi() };
    case 'when': return { id, t: 'when', rule: null, children: [] };
    case 'repeat': return { id, t: 'repeat', over: '', where: null, children: [] };
    default: return { id, t: 'alternatives', variants: [{ rule: null, children: [] }] };
  }
}

/** A copy with fresh ids all the way down, so a duplicated block does not share ids with the original. */
export function cloneNode(n: LetterNode): LetterNode {
  const copy = JSON.parse(JSON.stringify(n)) as LetterNode;
  const reId = (x: LetterNode) => {
    x.id = newId();
    if (x.t === 'when' || x.t === 'repeat') x.children.forEach(reId);
    if (x.t === 'alternatives') x.variants.forEach((v) => v.children.forEach(reId));
  };
  reId(copy);
  return copy;
}
