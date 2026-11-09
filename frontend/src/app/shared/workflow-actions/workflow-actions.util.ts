import type { ActionInput, CaseAction } from '../../core/services/workflow.service';
import type { I18nService } from '../../core/i18n/i18n.service';

// The rules for presenting a workflow action, shared by every screen that renders the buttons the engine
// offers (the generic actions card and the underwriter's Decision and Disbursement tabs), so the wording
// and styling cannot drift between them.

export function buttonClassOf(a: CaseAction): string {
  return a.ui.style === 'primary' ? 'db-btn--accent' : a.ui.style === 'danger' ? 'db-btn--ghost' : 'db-btn--outline';
}

export function labelOf(a: { label: { en: string; he: string } }, i18n: I18nService): string {
  return a.label[i18n.lang()] || a.label.en;
}

/** A person-readable name for an input: a translation if there is one, otherwise the field name itself. */
export function fieldLabelOf(f: { field: string }, i18n: I18nService): string {
  const key = `uw.extra.in.${f.field}`;
  const t = i18n.t(key);
  return t === key ? f.field : t;
}

/** "Please fill in X" for a required input left empty; an action may word its own (uw.needs.<action>.<field>). */
export function missingInputMessage(a: CaseAction, f: ActionInput, i18n: I18nService): string {
  const key = `uw.needs.${a.key}.${f.field}`;
  const own = i18n.t(key);
  return own !== key ? own : i18n.t('uw.extra.needs', { field: f.field });
}

/** The success message: the action's own wording (uw.done.<action>) or a generic "<label>: done.". */
export function doneMessage(a: CaseAction, i18n: I18nService): string {
  const key = `uw.done.${a.key}`;
  const own = i18n.t(key);
  return own !== key ? own : i18n.t('uw.extra.done', { action: labelOf(a, i18n) });
}

/** A finite number from what was typed, or null (so "1e", "-" and the like are rejected, not sent as NaN). */
export function parseNumber(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
}
