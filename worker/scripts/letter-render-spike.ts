// Writes the sample letter to a PDF for looking at: npx tsx scripts/letter-render-spike.ts out.pdf
import { readFileSync, writeFileSync } from "node:fs";
import { LETTER_DICTIONARY } from "../src/lib/letters/dictionary";
import { resolveBoth } from "../src/lib/letters/resolve";
import { SAMPLE_DATA, SAMPLE_LETTER } from "../src/lib/letters/samples";
import { renderLetterPdf } from "../src/lib/pdf/letter-renderer";

const f = (n: string) => readFileSync(new URL(`../src/assets/fonts/${n}`, import.meta.url));
const out = process.argv[2] ?? "letter.pdf";
const t0 = performance.now();
const bytes = await renderLetterPdf({
  letters: resolveBoth({ document: SAMPLE_LETTER, dictionary: LETTER_DICTIONARY, data: SAMPLE_DATA, today: "2026-11-13" }),
  fontBytes: { regular: f("Alef-Regular.ttf"), bold: f("Alef-Bold.ttf") }, images: new Map(), title: "Sample letter",
});
writeFileSync(out, bytes);
console.log(`${out}: ${bytes.length} bytes in ${(performance.now() - t0).toFixed(0)} ms`);
