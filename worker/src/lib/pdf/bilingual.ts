import { parseMarkup, type Run } from "../letters/markup";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import bidiFactory from "bidi-js";

// Typesetting for letters that are issued in English and Hebrew. The other generated documents use the
// built-in Helvetica, which has no Hebrew (not even the shekel sign); letters embed a Unicode font and
// order each line for right-to-left reading.
//
// Hebrew needs ordering but not shaping (its letters do not join), so the Unicode bidirectional algorithm
// plus a font that has the glyphs is enough: no text-shaping engine is needed.

export type Lang = "en" | "he";
export interface LetterFonts { regular: PDFFont; bold: PDFFont }

const bidi = bidiFactory();

/**
 * Reorders one line for display: returns the characters in the order they are drawn from left to right.
 * Hebrew runs come out reversed, while numbers and Latin words inside them keep their own direction and
 * brackets are mirrored. `base` is the paragraph direction.
 */
export function visualOrder(line: string, base: "ltr" | "rtl"): string {
  if (!line) return line;
  const levels = bidi.getEmbeddingLevels(line, base);
  const chars = line.split("");
  for (const [i, ch] of bidi.getMirroredCharactersMap(line, levels.levels)) chars[i] = ch;
  for (const [start, end] of bidi.getReorderSegments(line, levels)) {
    for (let a = start, b = end; a < b; a++, b--) [chars[a], chars[b]] = [chars[b], chars[a]];
  }
  return chars.join("");
}

const HEBREW = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
const LATIN = /[A-Za-z\u00C0-\u024F]/;

/**
 * The embedding library (fontkit) lays text out itself and, when the first letter that has a script is
 * Hebrew, reverses the glyphs a second time for right-to-left reading. Our own ordering has already put
 * the line in drawing order, so that second reversal would scramble it. This hands the library the line
 * pre-reversed in exactly that case, so the final order is the one `visualOrder` produced.
 * (Digits, punctuation and the shekel sign have no script of their own and are skipped, as the library does.)
 */
export function forEmbeddedFont(visual: string): string {
  for (const ch of visual) {
    if (HEBREW.test(ch)) return [...visual].reverse().join("");
    if (LATIN.test(ch)) return visual;
  }
  return visual;
}

/**
 * Splits a line already in drawing order into runs of one script, each ready to hand to the font library.
 * The library picks one direction for whatever string it is given, from the first letter that has a script,
 * so a line mixing Latin and Hebrew ("Noa Levi שלום") cannot go through it whole: one of the scripts would be
 * reversed. Signs, spaces and digits go with the run they follow (leading ones with the first run).
 */
export function embeddedRuns(visual: string): string[] {
  const runs: { text: string; script: "H" | "L" | null }[] = [];
  let cur = { text: "", script: null as "H" | "L" | null };
  for (const ch of visual) {
    const script = HEBREW.test(ch) ? "H" : LATIN.test(ch) ? "L" : null;
    if (script && cur.script && script !== cur.script) { runs.push(cur); cur = { text: "", script: null }; }
    cur.text += ch;
    if (script && !cur.script) cur.script = script;
  }
  if (cur.text) runs.push(cur);
  return runs.map((r) => (r.script === "H" ? [...r.text].reverse().join("") : r.text));
}

/** Embeds the letter fonts into a document. `regular` and `bold` are the TTF bytes. */
export async function embedLetterFonts(doc: PDFDocument, bytes: { regular: Uint8Array | ArrayBuffer; bold: Uint8Array | ArrayBuffer }): Promise<LetterFonts> {
  doc.registerFontkit(fontkit);
  return {
    regular: await doc.embedFont(bytes.regular, { subset: true }),
    bold: await doc.embedFont(bytes.bold, { subset: true }),
  };
}

/** Replaces characters the font cannot draw (they would print as an empty box) with a space. */
export function drawable(text: string, font: PDFFont): string {
  const have = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    out += cp === 10 || have.has(cp) ? ch : " ";
  }
  return out;
}

/** Breaks text into lines no wider than `maxWidth`, in reading order (before any reordering for display). */
export function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(" ").filter((w) => w !== "");
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (cur && font.widthOfTextAtSize(cand, size) > maxWidth) { out.push(cur); cur = w; } else cur = cand;
    }
    out.push(cur);
  }
  return out;
}

export interface TextStyle { lang: Lang; size?: number; bold?: boolean; color?: RGB; lineHeight?: number }

/** Draws one line, aligned to the leading edge of its language (left for English, right for Hebrew). */
export function drawLine(page: PDFPage, fonts: LetterFonts, line: string, x: number, y: number, width: number, s: TextStyle): void {
  const font = s.bold ? fonts.bold : fonts.regular, size = s.size ?? 11;
  const runs = embeddedRuns(visualOrder(drawable(line, font), s.lang === "he" ? "rtl" : "ltr"));
  const widths = runs.map((r) => font.widthOfTextAtSize(r, size));
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = s.lang === "he" ? x + width - total : x;
  runs.forEach((r, i) => { page.drawText(r, { x: cx, y, size, font, color: s.color ?? rgb(0.1, 0.12, 0.16) }); cx += widths[i]; });
}

/** Draws a wrapped paragraph and returns the y position below it. */
export function drawParagraph(page: PDFPage, fonts: LetterFonts, text: string, x: number, y: number, width: number, s: TextStyle): number {
  const font = s.bold ? fonts.bold : fonts.regular, size = s.size ?? 11, lh = s.lineHeight ?? size * 1.5;
  for (const line of wrapLines(drawable(text, font), font, size, width)) { drawLine(page, fonts, line, x, y, width, s); y -= lh; }
  return y;
}

/** Draws a two-column label / value table. In Hebrew the label column is on the right and values on the left. */
export function drawTable(page: PDFPage, fonts: LetterFonts, rows: { label: string; value: string }[], x: number, y: number, width: number, s: TextStyle): number {
  const size = s.size ?? 11, rowH = size * 1.9, line = rgb(0.84, 0.87, 0.91);
  for (const r of rows) {
    page.drawLine({ start: { x, y: y + size * 1.3 }, end: { x: x + width, y: y + size * 1.3 }, thickness: 0.5, color: line });
    const half = width * 0.62;
    if (s.lang === "he") {
      drawLine(page, fonts, r.label, x + width - half, y, half, s);
      drawLine(page, fonts, r.value, x, y, width - half - 8, { ...s, lang: "en", bold: true });
    } else {
      drawLine(page, fonts, r.label, x, y, half, s);
      const vw = fonts.bold.widthOfTextAtSize(drawable(r.value, fonts.bold), size);
      drawLine(page, fonts, r.value, x + width - vw, y, vw, { ...s, bold: true });
    }
    y -= rowH;
  }
  return y;
}


// ---- styled text: bold, italic and underline runs, wrapped, reordered for Hebrew and drawn per run

/** One character with its style. */
export interface SChar { ch: string; b: boolean; i: boolean; u: boolean }
export type Align = "start" | "center" | "end";

/** Rich text (letters/markup.ts) as a list of styled characters. Text with broken markup is shown as plain text. */
export function styledChars(markup: string): SChar[] {
  const p = parseMarkup(markup);
  const runs: Run[] = p.error ? [{ text: markup, b: false, i: false, u: false }] : p.runs;
  return runs.flatMap((r) => [...r.text].map((ch) => ({ ch, b: r.b, i: r.i, u: r.u })));
}

const supported = new WeakMap<PDFFont, Set<number>>();
function drawableChar(ch: string, font: PDFFont): string {
  let set = supported.get(font);
  if (!set) { set = new Set(font.getCharacterSet()); supported.set(font, set); }
  const cp = ch.codePointAt(0)!;
  return cp === 0x20 || set.has(cp) ? ch : " ";
}

const fontOf = (fonts: LetterFonts, bold: boolean) => (bold ? fonts.bold : fonts.regular);

/** Width of characters as drawn: each stretch in one weight is measured with that weight's face. */
export function widthOfStyled(chars: SChar[], fonts: LetterFonts, size: number, baseBold = false): number {
  let w = 0, buf = "", bold = false;
  const flush = () => { if (buf) w += fontOf(fonts, bold).widthOfTextAtSize(buf, size); buf = ""; };
  for (const c of chars) {
    const b = baseBold || c.b;
    if (b !== bold) { flush(); bold = b; }
    buf += drawableChar(c.ch, fontOf(fonts, b));
  }
  flush();
  return w;
}

/** Greedy word wrap of styled text. A newline is a hard break; a word longer than the line is split. Trailing spaces are dropped. */
export function wrapStyled(chars: SChar[], fonts: LetterFonts, size: number, maxWidth: number, baseBold = false): SChar[][] {
  const lines: SChar[][] = [];
  let line: SChar[] = [];
  const trim = (l: SChar[]) => { let e = l.length; while (e > 0 && l[e - 1].ch === " ") e--; return l.slice(0, e); };
  const w = (l: SChar[]) => widthOfStyled(trim(l), fonts, size, baseBold);
  const words: SChar[][] = [];
  let cur: SChar[] = [];
  for (const c of chars) {
    if (c.ch === "\n") { words.push(cur, [c]); cur = []; continue; }
    cur.push(c);
    if (c.ch === " ") { words.push(cur); cur = []; }
  }
  words.push(cur);
  for (const word of words) {
    if (word.length === 1 && word[0].ch === "\n") { lines.push(trim(line)); line = []; continue; }
    if (!word.length) continue;
    if (line.length === 0 || w([...line, ...word]) <= maxWidth) { line.push(...word); continue; }
    lines.push(trim(line)); line = [];
    let rest = word;
    while (w(rest) > maxWidth && rest.length > 1) {
      let k = rest.length - 1;
      while (k > 1 && w(rest.slice(0, k)) > maxWidth) k--;
      lines.push(rest.slice(0, k)); rest = rest.slice(k);
    }
    line = rest;
  }
  lines.push(trim(line));
  return lines;
}

/** Characters of a line in the order they are drawn left to right, with their styles carried along and brackets mirrored. */
export function visualStyled(line: SChar[], font: PDFFont, base: "ltr" | "rtl"): SChar[] {
  if (!line.length) return line;
  const text = line.map((c) => drawableChar(c.ch, font)).join("");
  // A string of equal length per character is needed to index by position; astral characters are not used in letters.
  if ([...text].length !== line.length) return line;
  const chars = [...text];
  const levels = bidi.getEmbeddingLevels(text, base);
  for (const [i, ch] of bidi.getMirroredCharactersMap(text, levels.levels)) chars[i] = ch;
  const idx = chars.map((_, i) => i);
  for (const [start, end] of bidi.getReorderSegments(text, levels)) {
    for (let a = start, b = end; a < b; a++, b--) [idx[a], idx[b]] = [idx[b], idx[a]];
  }
  return idx.map((i) => ({ ...line[i], ch: chars[i] }));
}

export interface DrawRun { text: string; bold: boolean; italic: boolean; underline: boolean; width: number }

/** Splits a drawing-ordered line into runs of one script and one style, each ready for the font library (see embeddedRuns). */
export function styledRuns(visual: SChar[], fonts: LetterFonts, size: number, baseBold = false): DrawRun[] {
  const runs: { chars: SChar[]; script: "H" | "L" | null; b: boolean; i: boolean; u: boolean }[] = [];
  let cur: (typeof runs)[number] | null = null;
  for (const c of visual) {
    const script = HEBREW.test(c.ch) ? "H" : LATIN.test(c.ch) ? "L" : null;
    const b = baseBold || c.b;
    const breaks = cur && ((script && cur.script && script !== cur.script) || cur.b !== b || cur.i !== c.i || cur.u !== c.u);
    if (!cur || breaks) { cur = { chars: [], script: null, b, i: c.i, u: c.u }; runs.push(cur); }
    cur.chars.push(c);
    if (script && !cur.script) cur.script = script;
  }
  return runs.map((r) => {
    const f = fontOf(fonts, r.b);
    const raw = r.chars.map((c) => c.ch).join("");
    const text = r.script === "H" ? [...raw].reverse().join("") : raw;
    return { text, bold: r.b, italic: r.i, underline: r.u, width: f.widthOfTextAtSize(text, size) };
  });
}

export interface StyledLineOpts { lang: Lang; size: number; color?: RGB; bold?: boolean; align?: Align }

/** Draws one wrapped line at `x`..`x + width`, aligned (start is the right-hand side in Hebrew). Returns its drawn width. */
export function drawStyledLine(page: PDFPage, fonts: LetterFonts, line: SChar[], x: number, y: number, width: number, o: StyledLineOpts): number {
  const runs = styledRuns(visualStyled(line, fonts.regular, o.lang === "he" ? "rtl" : "ltr"), fonts, o.size, o.bold);
  const total = runs.reduce((a, r) => a + r.width, 0);
  const align = o.align ?? "start";
  const left = align === "center" ? x + (width - total) / 2 : (align === "start") === (o.lang === "en") ? x : x + width - total;
  let cx = left;
  const color = o.color ?? rgb(0.1, 0.12, 0.16);
  for (const r of runs) {
    const font = fontOf(fonts, r.bold);
    if (r.text.trim() !== "" || r.underline) {
      page.drawText(r.text, { x: cx, y, size: o.size, font, color, ...(r.italic ? { ySkew: degrees(12) } : {}) });
      if (r.underline) page.drawLine({ start: { x: cx, y: y - o.size * 0.12 }, end: { x: cx + r.width, y: y - o.size * 0.12 }, thickness: Math.max(0.5, o.size / 18), color });
    }
    cx += r.width;
  }
  return total;
}
