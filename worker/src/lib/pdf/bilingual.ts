import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
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
  const visual = forEmbeddedFont(visualOrder(drawable(line, font), s.lang === "he" ? "rtl" : "ltr"));
  const w = font.widthOfTextAtSize(visual, size);
  page.drawText(visual, { x: s.lang === "he" ? x + width - w : x, y, size, font, color: s.color ?? rgb(0.1, 0.12, 0.16) });
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
