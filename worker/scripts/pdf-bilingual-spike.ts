/**
 * Proof that a bilingual (English + Hebrew) letter can be typeset with the libraries the Worker already
 * uses plus an embedded font. Not part of the app. Run:
 *   npx tsx scripts/pdf-bilingual-spike.ts <output.pdf>
 * and open the PDF. Prints timings, because Worker CPU time is the thing to watch.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, rgb } from "pdf-lib";
import { embedLetterFonts, drawParagraph, drawTable, drawLine, visualOrder, type Lang } from "../src/lib/pdf/bilingual";

const out = process.argv[2];
if (!out) throw new Error("usage: pdf-bilingual-spike.ts <output.pdf>");
const font = (n: string) => readFileSync(new URL(`../src/assets/fonts/${n}`, import.meta.url));

const TEXT: Record<Lang, { title: string; head: string; intro: string; rate: string; warn: string; rows: [string, string][]; borrowers: string; people: string[]; docs: string; footer: string }> = {
  en: {
    title: "DigiBank · Loan Key Facts", head: "Main Features of the Loan",
    intro: "Product: Personal Loan\nAmount of the loan: ₪150,000\nPurpose: Debt Consolidation\nDuration of the loan: 5 years",
    rate: "The rate is fixed at 5.40% a year for the first 24 months. After that, the bank’s variable rate applies for the rest of the term.",
    warn: "The rate can change. A change will alter your monthly repayment and the total amount you pay back.",
    rows: [["Monthly repayment", "₪2,858"], ["Total amount to be repaid", "₪171,495"], ["You repay for every ₪1 borrowed", "1.14"]],
    borrowers: "Borrowers", people: ["Noa Levi (Main borrower), income ₪21,500 a month", "Daniel Levi (Joint borrower), income ₪14,000 a month"],
    docs: "Documents we still need", footer: "DigiBank Ltd · Generated from template version 3 · Page 1 of 2",
  },
  he: {
    title: "דיגיבנק · עיקרי ההלוואה", head: "מאפיינים עיקריים של ההלוואה",
    intro: "מוצר: הלוואה אישית\nסכום ההלוואה: ‏150,000 ₪\nמטרה: איחוד הלוואות\nמשך ההלוואה: 5 שנים",
    rate: "הריבית קבועה בשיעור 5.40% בשנה ב-24 החודשים הראשונים. לאחר מכן תחול ריבית המשתנה של הבנק עד תום התקופה.",
    warn: "הריבית עשויה להשתנות. שינוי ישפיע על ההחזר החודשי ועל הסכום הכולל שתשלם.",
    rows: [["החזר חודשי", "₪2,858"], ["סך כל הסכום להחזר", "₪171,495"], ["תחזיר על כל ₪1 שנלווה", "1.14"]],
    borrowers: "לווים", people: ["נועה לוי (לווה ראשי), הכנסה ‏21,500 ₪ בחודש", "דניאל לוי (לווה במשותף), הכנסה ‏14,000 ₪ בחודש"],
    docs: "מסמכים שעדיין חסרים", footer: "דיגיבנק בע״מ · הופק מתבנית גרסה 3 · עמוד 2 מתוך 2",
  },
};

const t0 = performance.now();
const doc = await PDFDocument.create();
const fonts = await embedLetterFonts(doc, { regular: font("Alef-Regular.ttf"), bold: font("Alef-Bold.ttf") });
const tFonts = performance.now();
const blue = rgb(0, 63 / 255, 121 / 255), grey = rgb(0.45, 0.48, 0.52);

for (const lang of ["en", "he"] as Lang[]) {
  const page = doc.addPage([595.28, 841.89]);
  const X = 50, W = 495.28, T = TEXT[lang];
  let y = 790;
  drawLine(page, fonts, T.title, X, y, W, { lang, size: 17, bold: true, color: blue });
  page.drawRectangle({ x: X, y: y - 10, width: W, height: 2.5, color: blue });
  y -= 42;
  drawLine(page, fonts, T.head, X, y, W, { lang, size: 14, bold: true, color: blue }); y -= 22;
  y = drawParagraph(page, fonts, T.intro, X, y, W, { lang }) - 8;
  y = drawParagraph(page, fonts, T.rate, X, y, W, { lang }) - 4;
  y = drawParagraph(page, fonts, T.warn, X, y, W, { lang }) - 10;
  drawLine(page, fonts, T.borrowers, X, y, W, { lang, size: 12, bold: true, color: blue }); y -= 18;
  for (const p of T.people) y = drawParagraph(page, fonts, "•  " + p, X + (lang === "en" ? 8 : 0), y, W - 8, { lang });
  y -= 10;
  y = drawTable(page, fonts, T.rows.map(([label, value]) => ({ label, value })), X, y, W, { lang }) - 14;
  drawLine(page, fonts, T.docs, X, y, W, { lang, size: 12, bold: true, color: blue });
  drawLine(page, fonts, T.footer, X, 40, W, { lang, size: 8.5, color: grey });
}
const bytes = await doc.save();
const t1 = performance.now();
writeFileSync(out, bytes);
console.log(`fonts embedded in ${(tFonts - t0).toFixed(0)} ms; whole 2-page document in ${(t1 - t0).toFixed(0)} ms; ${(bytes.length / 1024).toFixed(0)} KB`);
console.log("sample ordering:", JSON.stringify(visualOrder("הכנסה 21,500 ₪ (חודשית)", "rtl")));
