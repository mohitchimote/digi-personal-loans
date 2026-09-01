import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Shared drawing primitives for every generated document in the offer pack (approval letter, key
// facts statement, T&Cs, repayment schedule) — one letterhead/footer/pagination style across all
// of them instead of each file reinventing it.

export const TCS_BLUE = rgb(0 / 255, 51 / 255, 102 / 255);
export const TCS_YELLOW = rgb(251 / 255, 176 / 255, 52 / 255);
export const GREY = rgb(120 / 255, 120 / 255, 120 / 255);
export const BLACK = rgb(0, 0, 0);
export const LIGHT_GREY = rgb(235 / 255, 235 / 255, 235 / 255);

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89; // A4
export const MARGIN_X = 50;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
export const BOTTOM_MARGIN = 60;

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// pdf-lib's standard Helvetica font uses WinAnsi encoding, which has no glyph for ₪ (U+20AA) —
// embedding a custom Unicode font just for one currency symbol isn't worth the bundle-size cost
// for a demo letter, so every generated document uses this ISO fallback instead. The JSON API and
// Angular UI keep using ₪ everywhere else, unaffected.
export function money(n: number): string {
  return `NIS ${Math.round(n).toLocaleString("en-US")}`;
}

export interface PdfFonts {
  bold: PDFFont;
  regular: PDFFont;
}

export interface PageCursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  fonts: PdfFonts;
  title: string;
}

/** Starts a new page with the brand header (logo/title left, reference/date right, yellow rule)
 * repeated on every page of a multi-page document — approval letters stay single-page and draw
 * their own header inline, but T&Cs/repayment schedules paginate and need it on each page. */
export function newPage(doc: PDFDocument, fonts: PdfFonts, applicationRef: string, title: string): PageCursor {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 50;

  page.drawText("DigiLend", { x: MARGIN_X, y, size: 18, font: fonts.bold, color: TCS_BLUE });
  page.drawText("Personal Banking", { x: MARGIN_X, y: y - 14, size: 8, font: fonts.regular, color: TCS_BLUE });

  const refValue = applicationRef;
  const dateValue = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  page.drawText(refValue, {
    x: PAGE_WIDTH - MARGIN_X - fonts.bold.widthOfTextAtSize(refValue, 9),
    y,
    size: 9,
    font: fonts.bold,
    color: TCS_BLUE,
  });
  page.drawText(dateValue, {
    x: PAGE_WIDTH - MARGIN_X - fonts.regular.widthOfTextAtSize(dateValue, 8),
    y: y - 12,
    size: 8,
    font: fonts.regular,
    color: BLACK,
  });

  y -= 32;
  page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_WIDTH, height: 3, color: TCS_YELLOW });
  y -= 22;

  page.drawText(title, { x: MARGIN_X, y, size: 13, font: fonts.bold, color: TCS_BLUE });
  y -= 22;

  return { doc, page, y, fonts, title };
}

/** Advances the cursor, starting a fresh page (with header repeated) if the next line would land
 * below the bottom margin. Every drawing helper below routes through this so callers never need
 * their own pagination bookkeeping. */
export function ensureSpace(cursor: PageCursor, applicationRef: string, neededHeight: number): void {
  if (cursor.y - neededHeight < BOTTOM_MARGIN) {
    const fresh = newPage(cursor.doc, cursor.fonts, applicationRef, cursor.title);
    cursor.page = fresh.page;
    cursor.y = fresh.y;
  }
}

export function drawSectionHeading(cursor: PageCursor, applicationRef: string, text: string): void {
  ensureSpace(cursor, applicationRef, 24);
  cursor.y -= 4;
  cursor.page.drawText(text, { x: MARGIN_X, y: cursor.y, size: 11.5, font: cursor.fonts.bold, color: TCS_BLUE });
  cursor.y -= 16;
}

export function drawParagraph(cursor: PageCursor, applicationRef: string, text: string, size = 9.5): void {
  const lines = wrapText(text, cursor.fonts.regular, size, CONTENT_WIDTH);
  for (const line of lines) {
    ensureSpace(cursor, applicationRef, size + 4);
    cursor.page.drawText(line, { x: MARGIN_X, y: cursor.y, size, font: cursor.fonts.regular, color: BLACK });
    cursor.y -= size + 4;
  }
  cursor.y -= 6;
}

export function drawKeyValueRow(cursor: PageCursor, applicationRef: string, label: string, value: string): void {
  ensureSpace(cursor, applicationRef, 16);
  cursor.page.drawText(label, { x: MARGIN_X, y: cursor.y, size: 9, font: cursor.fonts.bold, color: BLACK });
  const lines = wrapText(value, cursor.fonts.regular, 9, CONTENT_WIDTH - 220);
  cursor.page.drawText(lines[0] ?? "", { x: MARGIN_X + 220, y: cursor.y, size: 9, font: cursor.fonts.regular, color: BLACK });
  cursor.y -= 15;
  for (const extra of lines.slice(1)) {
    ensureSpace(cursor, applicationRef, 15);
    cursor.page.drawText(extra, { x: MARGIN_X + 220, y: cursor.y, size: 9, font: cursor.fonts.regular, color: BLACK });
    cursor.y -= 15;
  }
}

export function drawFooterDisclaimer(cursor: PageCursor, applicationRef: string, text: string): void {
  ensureSpace(cursor, applicationRef, 40);
  cursor.y -= 10;
  cursor.page.drawRectangle({ x: MARGIN_X, y: cursor.y, width: CONTENT_WIDTH, height: 1.5, color: TCS_YELLOW });
  cursor.y -= 14;
  const lines = wrapText(text, cursor.fonts.regular, 7, CONTENT_WIDTH);
  for (const line of lines) {
    ensureSpace(cursor, applicationRef, 10);
    cursor.page.drawText(line, { x: MARGIN_X, y: cursor.y, size: 7, font: cursor.fonts.regular, color: GREY });
    cursor.y -= 10;
  }
}

export async function embedFonts(doc: PDFDocument): Promise<PdfFonts> {
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  return { bold, regular };
}

// Every offer-pack document not yet backed by real Legal/Compliance-approved wording carries this
// note — see the conversation that led to this file: these are illustrative placeholders standing
// in for a proper ESIS/SECCI-equivalent artefact, not reviewed Israeli consumer-credit disclosure
// text. Swap this out (and the surrounding content) once real requirements exist.
export const ILLUSTRATIVE_NOTICE =
  "This document is an illustrative placeholder for demonstration purposes. Final wording is subject to review and approval by DigiLend Legal & Compliance before use with real customers.";
