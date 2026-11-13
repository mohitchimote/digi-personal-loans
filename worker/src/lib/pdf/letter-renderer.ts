import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { drawStyledLine, embedLetterFonts, styledChars, wrapStyled, type Align, type Lang, type LetterFonts, type SChar } from "./bilingual";
import type { Block, ResolvedLetter } from "../letters/types";

// Draws resolved letters (letters/resolve.ts) as one PDF: the English letter, then the Hebrew one. It only
// draws; what is printed was decided by the engine, so every implementation shows the same text. Layout:
// A4, header and footer repeated on every page of a language, page numbers restarting per language.

export interface LetterImageFile { mimeType: string; bytes: Uint8Array }
export interface RenderInput {
  letters: { en: ResolvedLetter; he: ResolvedLetter };
  fontBytes: { regular: Uint8Array | ArrayBuffer; bold: Uint8Array | ArrayBuffer };
  images: ReadonlyMap<string, LetterImageFile>;
  title: string;
}

const W = 595.28, H = 841.89, MARGIN = 56, CONTENT_W = W - MARGIN * 2;
const GAP = 8;
const INK = rgb(0.1, 0.12, 0.16), MUTED = rgb(0.45, 0.48, 0.52), BLUE = rgb(0, 63 / 255, 121 / 255), RULE = rgb(0.84, 0.87, 0.91);
const MAX_IMAGE_W = 170, MAX_IMAGE_H = 80;

interface Ctx { doc: PDFDocument; fonts: LetterFonts; images: ReadonlyMap<string, LetterImageFile>; embedded: Map<string, PDFImage | null>; lang: Lang }

const font = (c: Ctx, bold: boolean): PDFFont => (bold ? c.fonts.bold : c.fonts.regular);
const lineHeight = (size: number) => size * 1.5;

async function embedImage(c: Ctx, id: string | undefined): Promise<PDFImage | null> {
  if (!id) return null;
  if (c.embedded.has(id)) return c.embedded.get(id)!;
  const file = c.images.get(id);
  let img: PDFImage | null = null;
  if (file) {
    try { img = file.mimeType === "image/png" ? await c.doc.embedPng(file.bytes) : await c.doc.embedJpg(file.bytes); } catch { img = null; }
  }
  c.embedded.set(id, img);
  return img;
}

function imageSize(img: PDFImage): { w: number; h: number } {
  const k = Math.min(MAX_IMAGE_W / img.width, MAX_IMAGE_H / img.height, 1);
  return { w: img.width * k, h: img.height * k };
}

/** Wrapped, styled lines of a piece of rich text. */
function layout(c: Ctx, markup: string, size: number, bold: boolean, width: number): SChar[][] {
  return wrapStyled(styledChars(markup), c.fonts, size, width, bold);
}

const STEP = 18;
/** The block's area for a given indent: it grows from the start side (left in English, right in Hebrew). */
const region = (lang: Lang, indent = 0) => ({ x: lang === "he" ? MARGIN : MARGIN + indent * STEP, w: CONTENT_W - indent * STEP });

interface Flow { page: PDFPage; y: number; top: number; bottom: number; pages: PDFPage[]; newPage: () => PDFPage }

function ensure(flow: Flow, height: number): void {
  if (flow.y - height < flow.bottom) { flow.page = flow.newPage(); flow.y = flow.top; }
}

async function drawBlock(c: Ctx, flow: Flow, b: Block): Promise<void> {
  const he = c.lang === "he";
  const opts = (size: number, o: { bold?: boolean; color?: typeof INK; align?: Align } = {}) => ({ lang: c.lang, size, bold: o.bold, color: o.color ?? INK, align: o.align });
  switch (b.type) {
    case "heading": {
      const size = b.level === 3 ? 11.5 : b.level === 2 ? 13.5 : 16, lh = lineHeight(size);
      const r = region(c.lang, b.indent);
      const lines = layout(c, b.text, size, true, r.w);
      flow.y -= 6; ensure(flow, lh * Math.min(lines.length, 2) + GAP);
      for (const l of lines) { ensure(flow, lh); drawStyledLine(flow.page, c.fonts, l, r.x, flow.y - size, r.w, opts(size, { bold: true, color: BLUE, align: b.align })); flow.y -= lh; }
      flow.y -= GAP / 2;
      break;
    }
    case "paragraph": {
      const size = 10.5, lh = lineHeight(size);
      const r = region(c.lang, b.indent);
      const lines = layout(c, b.text, size, false, r.w);
      ensure(flow, Math.min(lh * lines.length, lh * 3));
      for (const l of lines) { ensure(flow, lh); drawStyledLine(flow.page, c.fonts, l, r.x, flow.y - size, r.w, opts(size, { align: b.align })); flow.y -= lh; }
      flow.y -= GAP;
      break;
    }
    case "list": {
      const size = 10.5, lh = lineHeight(size), marker = 16;
      const counters = [0, 0, 0];
      b.items.forEach((item, k) => {
        const level = Math.min(2, b.levels?.[k] ?? 0);
        // A new item at a shallower level restarts the numbering below it.
        counters[level]++; for (let d = level + 1; d < counters.length; d++) counters[d] = 0;
        const label = b.ordered ? `${counters[level]}.` : level === 0 ? "•" : "–";
        const r = region(c.lang, level);
        const lines = layout(c, item, size, false, r.w - marker);
        ensure(flow, lh * Math.min(lines.length, 2));
        lines.forEach((l, i) => {
          ensure(flow, lh);
          if (i === 0) drawStyledLine(flow.page, c.fonts, styledChars(label), he ? r.x + r.w - marker : r.x, flow.y - size, marker - 3, { ...opts(size), align: he ? "end" : "start" } as never);
          drawStyledLine(flow.page, c.fonts, l, he ? r.x : r.x + marker, flow.y - size, r.w - marker, opts(size));
          flow.y -= lh;
        });
      });
      flow.y -= GAP;
      break;
    }
    case "table": {
      const size = 10.5, lh = lineHeight(size), rowPad = 5;
      const labelW = CONTENT_W * 0.6, valueW = CONTENT_W - labelW - 10;
      for (const r of b.rows) {
        const labelLines = layout(c, r.label, size, false, labelW);
        const valueLines = layout(c, r.value, size, true, valueW);
        const rows = Math.max(labelLines.length, valueLines.length), h = rows * lh + rowPad * 2;
        ensure(flow, h);
        flow.page.drawLine({ start: { x: MARGIN, y: flow.y }, end: { x: MARGIN + CONTENT_W, y: flow.y }, thickness: 0.5, color: RULE });
        const labelX = he ? MARGIN + CONTENT_W - labelW : MARGIN;
        const valueX = he ? MARGIN : MARGIN + labelW + 10;
        labelLines.forEach((l, i) => drawStyledLine(flow.page, c.fonts, l, labelX, flow.y - rowPad - size - i * lh, labelW, opts(size)));
        // Values sit at the far edge of their column: right in English, left in Hebrew.
        valueLines.forEach((l, i) => drawStyledLine(flow.page, c.fonts, l, valueX, flow.y - rowPad - size - i * lh, valueW, opts(size, { bold: true, align: "end" })));
        flow.y -= h;
      }
      flow.page.drawLine({ start: { x: MARGIN, y: flow.y }, end: { x: MARGIN + CONTENT_W, y: flow.y }, thickness: 0.5, color: RULE });
      flow.y -= GAP * 1.5;
      break;
    }
    case "image": case "signature": {
      const img = await embedImage(c, b.imageId);
      const size = 9, lh = lineHeight(size);
      const caption = b.type === "signature" ? b.caption : b.alt;
      const dim = img ? imageSize(img) : { w: 0, h: b.type === "signature" ? 36 : 0 };
      const need = dim.h + (b.type === "signature" ? 6 + lh : 0) + GAP;
      ensure(flow, need);
      const x = he ? MARGIN + CONTENT_W - dim.w : MARGIN;
      if (img) flow.page.drawImage(img, { x, y: flow.y - dim.h, width: dim.w, height: dim.h });
      flow.y -= dim.h;
      if (b.type === "signature") {
        const lw = Math.max(dim.w, 150);
        const lx = he ? MARGIN + CONTENT_W - lw : MARGIN;
        flow.page.drawLine({ start: { x: lx, y: flow.y - 3 }, end: { x: lx + lw, y: flow.y - 3 }, thickness: 0.6, color: MUTED });
        flow.y -= 6;
        if (caption) { for (const l of layout(c, caption, size, false, CONTENT_W)) { drawStyledLine(flow.page, c.fonts, l, MARGIN, flow.y - size, CONTENT_W, opts(size, { color: MUTED })); flow.y -= lh; } }
      }
      flow.y -= GAP;
      break;
    }
  }
}

/** Height a zone (header or footer) needs, so the body can leave room for it. */
function zoneHeight(c: Ctx, blocks: Block[]): number {
  let h = 0;
  for (const b of blocks) {
    if (b.type === "paragraph" || b.type === "heading") h += layout(c, b.text, b.type === "heading" ? 13 : 9, b.type === "heading", CONTENT_W).length * lineHeight(b.type === "heading" ? 13 : 9) + 2;
    else if (b.type === "image") { const img = c.embedded.get(b.imageId ?? ""); h += (img ? imageSize(img).h : 0) + 4; }
    else if (b.type === "list") h += b.items.length * lineHeight(9);
  }
  return h;
}

async function drawZone(c: Ctx, page: PDFPage, blocks: Block[], top: number, tokens: { n: number; total: number }): Promise<void> {
  let y = top;
  const fill = (t: string) => t.replaceAll("{{page.number}}", String(tokens.n)).replaceAll("{{page.total}}", String(tokens.total));
  const he = c.lang === "he";
  for (const b of blocks) {
    if (b.type === "image") {
      const img = await embedImage(c, b.imageId);
      if (img) { const d = imageSize(img); page.drawImage(img, { x: he ? MARGIN + CONTENT_W - d.w : MARGIN, y: y - d.h, width: d.w, height: d.h }); y -= d.h + 4; }
    } else if (b.type === "paragraph" || b.type === "heading") {
      const size = b.type === "heading" ? 13 : 9, bold = b.type === "heading";
      for (const l of layout(c, fill(b.text), size, bold, CONTENT_W)) { drawStyledLine(page, c.fonts, l, MARGIN, y - size, CONTENT_W, { lang: c.lang, size, bold, color: bold ? BLUE : MUTED, align: b.align }); y -= lineHeight(size); }
      y -= 2;
    } else if (b.type === "list") {
      for (const i of b.items) { drawStyledLine(page, c.fonts, styledChars(fill(i)), MARGIN, y - 9, CONTENT_W, { lang: c.lang, size: 9, color: MUTED }); y -= lineHeight(9); }
    }
  }
}

async function renderOne(c: Ctx, letter: ResolvedLetter): Promise<void> {
  // Pictures first, so the header's height is known before anything is placed.
  for (const b of [...letter.header, ...letter.body, ...letter.footer]) if (b.type === "image" || b.type === "signature") await embedImage(c, b.imageId);
  const headerH = zoneHeight(c, letter.header), footerH = zoneHeight(c, letter.footer);
  const top = H - MARGIN - (headerH ? headerH + 10 : 0), bottom = MARGIN + (footerH ? footerH + 14 : 0);
  const pages: PDFPage[] = [];
  const newPage = () => { const p = c.doc.addPage([W, H]); pages.push(p); return p; };
  const flow: Flow = { page: newPage(), y: top, top, bottom, pages, newPage };
  for (const b of letter.body) await drawBlock(c, flow, b);
  for (let i = 0; i < pages.length; i++) {
    const tokens = { n: i + 1, total: pages.length };
    await drawZone(c, pages[i], letter.header, H - MARGIN, tokens);
    if (letter.header.length) pages[i].drawLine({ start: { x: MARGIN, y: top + 4 }, end: { x: MARGIN + CONTENT_W, y: top + 4 }, thickness: 0.5, color: RULE });
    if (letter.footer.length) {
      pages[i].drawLine({ start: { x: MARGIN, y: bottom - 4 }, end: { x: MARGIN + CONTENT_W, y: bottom - 4 }, thickness: 0.5, color: RULE });
      await drawZone(c, pages[i], letter.footer, MARGIN + footerH, tokens);
    }
  }
}

export async function renderLetterPdf(input: RenderInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(input.title);
  doc.setProducer("DigiLend letters");
  const fonts = await embedLetterFonts(doc, input.fontBytes);
  const embedded = new Map<string, PDFImage | null>();
  for (const lang of ["en", "he"] as const) {
    await renderOne({ doc, fonts, images: input.images, embedded, lang }, input.letters[lang]);
  }
  return doc.save();
}
