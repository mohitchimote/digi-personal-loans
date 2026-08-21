import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Ports PdfGeneratorService.java's single-page approval letter. Simplified visually (plain label:
// value rows instead of a shaded table) but matches the same content, section order, and copy —
// generated server-side via pdf-lib rather than iText, cheap enough (a handful of text draws on
// one page) to stay well within the Workers Free plan's per-request CPU budget.

const TCS_BLUE = rgb(0 / 255, 51 / 255, 102 / 255);
const TCS_YELLOW = rgb(251 / 255, 176 / 255, 52 / 255);
const GREY = rgb(120 / 255, 120 / 255, 120 / 255);
const BLACK = rgb(0, 0, 0);

export interface ApprovalLetterData {
  applicationRef: string;
  customerName: string;
  loanAmount: number;
  productName: string;
  interestRate: number;
  termMonths: number;
  monthlyRepayment: number;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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
// for a demo letter, so the PDF specifically uses the ISO fallback. The JSON API and Angular UI
// keep using ₪ everywhere else, unaffected.
function money(n: number): string {
  return `NIS ${Math.round(n).toLocaleString("en-US")}`;
}

export async function generateApprovalLetterPdf(data: ApprovalLetterData, isFinal: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const marginX = 50;
  const width = page.getWidth();
  const contentWidth = width - marginX * 2;
  let y = page.getHeight() - 50;

  // Header: brand left, reference/date right
  page.drawText("DigiLend", { x: marginX, y, size: 22, font: bold, color: TCS_BLUE });
  page.drawText("Personal Banking", { x: marginX, y: y - 16, size: 9, font: regular, color: TCS_BLUE });

  const refLabel = "Application Reference";
  const refValue = data.applicationRef;
  const dateValue = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  page.drawText(refLabel, {
    x: width - marginX - regular.widthOfTextAtSize(refLabel, 8),
    y,
    size: 8,
    font: regular,
    color: TCS_BLUE,
  });
  page.drawText(refValue, {
    x: width - marginX - bold.widthOfTextAtSize(refValue, 10),
    y: y - 12,
    size: 10,
    font: bold,
    color: TCS_BLUE,
  });
  page.drawText(dateValue, {
    x: width - marginX - regular.widthOfTextAtSize(dateValue, 8),
    y: y - 24,
    size: 8,
    font: regular,
    color: BLACK,
  });

  y -= 40;
  page.drawRectangle({ x: marginX, y, width: contentWidth, height: 4, color: TCS_YELLOW });
  y -= 30;

  const title = isFinal ? "FINAL APPROVAL LETTER" : "CONDITIONAL APPROVAL LETTER";
  page.drawText(title, {
    x: marginX + (contentWidth - bold.widthOfTextAtSize(title, 16)) / 2,
    y,
    size: 16,
    font: bold,
    color: TCS_BLUE,
  });
  y -= 20;
  const subtitle = "Personal Loan";
  page.drawText(subtitle, {
    x: marginX + (contentWidth - regular.widthOfTextAtSize(subtitle, 11)) / 2,
    y,
    size: 11,
    font: regular,
    color: BLACK,
  });
  y -= 35;

  page.drawText(`Dear ${data.customerName},`, { x: marginX, y, size: 11, font: regular, color: BLACK });
  y -= 20;

  const intro = isFinal
    ? "We are pleased to confirm that your application for a personal loan with DigiLend has been fully reviewed and approved by our underwriting team. All verification checks have been satisfactorily completed. Please review the final details of your offer below."
    : "We are pleased to confirm that your application for a personal loan with DigiLend has been conditionally approved, subject to satisfactory verification of the information and documents provided. Please review the details of your conditional offer below.";
  for (const line of wrapText(intro, regular, 10, contentWidth)) {
    page.drawText(line, { x: marginX, y, size: 10, font: regular, color: BLACK });
    y -= 14;
  }
  y -= 15;

  page.drawText("Loan Details", { x: marginX, y, size: 12, font: bold, color: TCS_BLUE });
  y -= 18;

  const totalRepayable = data.monthlyRepayment * data.termMonths;
  const rows: [string, string][] = [
    ["Product", data.productName],
    ["Loan Amount", money(data.loanAmount)],
    ["Interest Rate", `${data.interestRate}% APR`],
    ["Loan Term", `${data.termMonths} months`],
    ["Monthly Repayment", money(data.monthlyRepayment)],
    ["Total Repayable", money(totalRepayable)],
  ];
  for (const [label, value] of rows) {
    page.drawText(label, { x: marginX, y, size: 9, font: bold, color: BLACK });
    page.drawText(value, { x: marginX + 180, y, size: 9, font: regular, color: BLACK });
    y -= 16;
  }
  y -= 10;

  page.drawText(isFinal ? "Verification Completed" : "Conditions of Approval", {
    x: marginX,
    y,
    size: 12,
    font: bold,
    color: TCS_BLUE,
  });
  y -= 18;

  const conditions = isFinal
    ? [
        "Identity verification (Teudat Zehut) completed.",
        "Income documentation reviewed and confirmed.",
        "Bank statements reviewed and confirmed.",
        "No material change in financial circumstances identified.",
        "Application approved for execution of the formal Loan Agreement.",
      ]
    : [
        "Satisfactory verification of identity (Teudat Zehut).",
        "Receipt and verification of income documentation (payslips or Shuma).",
        "Receipt of three months' bank statements confirming income and outgoings.",
        "No material change in financial circumstances since the date of application.",
        "Execution of the formal Loan Agreement in the form provided by DigiLend.",
      ];
  conditions.forEach((c, i) => {
    for (const line of wrapText(`${i + 1}.  ${c}`, regular, 9, contentWidth)) {
      page.drawText(line, { x: marginX, y, size: 9, font: regular, color: BLACK });
      y -= 13;
    }
  });
  y -= 15;

  page.drawText("Next Steps", { x: marginX, y, size: 12, font: bold, color: TCS_BLUE });
  y -= 18;
  const nextSteps = isFinal
    ? "Your loan has been fully approved and no further action is required from you. Your DigiLend advisor will be in touch shortly to arrange execution of the Loan Agreement and drawdown of funds to your nominated account."
    : "Please log in to your DigiLend portal and upload the required supporting documents in the Documents section. Once all documents have been received and verified, your assigned advisor will contact you to arrange execution of the Loan Agreement and drawdown of funds.";
  for (const line of wrapText(nextSteps, regular, 10, contentWidth)) {
    page.drawText(line, { x: marginX, y, size: 10, font: regular, color: BLACK });
    y -= 14;
  }
  y -= 15;

  page.drawRectangle({ x: marginX, y, width: contentWidth, height: 2, color: TCS_YELLOW });
  y -= 15;

  const disclaimer = isFinal
    ? "This is a final approval. All verification checks referenced above have been satisfactorily completed. DigiLend Ltd is regulated under Israeli Banking Law 5761-2000. Registered in Israel No. 51-234567-8."
    : "This is a conditional approval only. DigiLend reserves the right to withdraw or amend this offer prior to drawdown. This letter does not constitute a binding commitment to lend. DigiLend Ltd is regulated under Israeli Banking Law 5761-2000. Registered in Israel No. 51-234567-8.";
  for (const line of wrapText(disclaimer, regular, 7, contentWidth)) {
    page.drawText(line, { x: marginX, y, size: 7, font: regular, color: GREY });
    y -= 10;
  }

  return doc.save();
}

export function friendlyDocumentName(type: string): string {
  switch (type) {
    case "APPROVAL_LETTER":
      return "Conditional Approval Letter";
    case "FINAL_APPROVAL_LETTER":
      return "Final Approval Letter";
    case "LOAN_AGREEMENT":
      return "Loan Agreement";
    case "REPAYMENT_SCHEDULE":
      return "Repayment Schedule";
    default:
      return type;
  }
}
