import { Dictionary, LetterDocument, LetterImage, Lang, LetterNode, SavedRule } from '../../../core/services/letters.service';
import { EvalContext } from '../../../core/letters/rules';

/** What the white page needs from the editor that owns it. Kept as an interface so the page components stay small. */
export interface PageHost {
  view(): 'letter' | 'structure';
  selected(): string | null;
  select(id: string | null, item?: number): void;
  /** Enter at the end of a paragraph, heading or point: start the next one and move into it. */
  enterFrom(id: string, lang: Lang, item?: number): void;
  /** Backspace in an empty point: remove it. */
  backspaceFrom(id: string, lang: Lang, item: number): void;
  /** Tab / Shift+Tab on a point: change its level. */
  tabFrom(id: string, item: number, outdent: boolean): void;
  dictionary(): Dictionary | null;
  saved(): SavedRule[];
  images(): LetterImage[];
  /** Context for resolving sample values: data, today, dictionary, saved rules. */
  baseCtx(): EvalContext;
  /** Call before a structural change so Undo can return to this point. */
  snap(): void;
  /** The letter changed (text typed or structure edited). */
  touch(): void;
  imageUrl(id: string | undefined): string | null;
  /** Opens the field picker for the editable the user is in. */
  openPicker(el: HTMLElement, lang: Lang, list: string | undefined, anchor?: DOMRect): void;
  /** Remembers where the cursor was in an editable, for the toolbar's Insert field. */
  remember(el: HTMLElement, range: Range | null, lang: Lang, list: string | undefined): void;
}

export type NodeOf<T extends LetterNode['t']> = Extract<LetterNode, { t: T }>;
export type Zone = 'header' | 'body' | 'footer';
export const ZONES: Zone[] = ['header', 'body', 'footer'];
export type { LetterDocument };
