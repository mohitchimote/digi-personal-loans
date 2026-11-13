import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { LETTER_DICTIONARY } from "../src/lib/letters/dictionary";
import { resolveBoth } from "../src/lib/letters/resolve";
import { SAMPLE_DATA, SAMPLE_LETTER } from "../src/lib/letters/samples";
import { validateLetter } from "../src/lib/letters/validate";
import { renderLetterPdf } from "../src/lib/pdf/letter-renderer";
import type { LetterDocument } from "../src/lib/letters/types";

const fonts = resolve(dirname(fileURLToPath(import.meta.url)), "../src/assets/fonts");
const fontBytes = { regular: readFileSync(resolve(fonts, "Alef-Regular.ttf")), bold: readFileSync(resolve(fonts, "Alef-Bold.ttf")) };
const render = (document: LetterDocument, data: Record<string, unknown>) =>
  renderLetterPdf({ letters: resolveBoth({ document, dictionary: LETTER_DICTIONARY, data, today: "2026-11-13" }), fontBytes, images: new Map(), title: "t" });

describe("sample letter", () => {
  it("passes the validator (only the missing-image warning for the signature)", () => {
    const issues = validateLetter(SAMPLE_LETTER, LETTER_DICTIONARY);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(issues.map((i) => i.code)).toEqual(["image.missing"]);
  });
  it("renders English then Hebrew into one PDF", async () => {
    const bytes = await render(SAMPLE_LETTER, SAMPLE_DATA);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
  it("flows a long letter over several pages in each language", async () => {
    const para = (i: number) => ({ id: `p${i}`, t: "paragraph" as const, text: { en: `Clause ${i}. ` + "The borrower agrees to repay the loan in full. ".repeat(6), he: `סעיף ${i}. ` + "הלווה מתחייב להחזיר את ההלוואה במלואה. ".repeat(6) } });
    const long: LetterDocument = { ...SAMPLE_LETTER, body: Array.from({ length: 40 }, (_, i) => para(i)) };
    const n = (await PDFDocument.load(await render(long, SAMPLE_DATA))).getPageCount();
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n % 2).toBe(0);
  });
});
