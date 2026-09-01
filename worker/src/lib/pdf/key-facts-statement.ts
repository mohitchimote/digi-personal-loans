import { PDFDocument } from "pdf-lib";
import {
  embedFonts,
  newPage,
  drawSectionHeading,
  drawParagraph,
  drawKeyValueRow,
  drawFooterDisclaimer,
  money,
  ILLUSTRATIVE_NOTICE,
} from "./pdf-common";

// Illustrative equivalent of the UK's SECCI ("Standard European Consumer Credit Information") /
// ESIS pre-contract disclosure sheet — the standardised, plain-language summary of a credit
// offer's key terms that a lender must hand a borrower before they commit. Israel's own
// equivalent sits in the Bank of Israel's Proper Conduct of Banking Business directives and the
// Fair Credit Law; this generator produces a demo-shaped stand-in for that, not reviewed legal
// text — see ILLUSTRATIVE_NOTICE.

export interface KeyFactsData {
  applicationRef: string;
  customerName: string;
  loanAmount: number;
  productName: string;
  interestRate: number;
  termMonths: number;
  monthlyRepayment: number;
}

export async function generateKeyFactsStatementPdf(data: KeyFactsData, isFinal: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  const title = isFinal ? "LOAN KEY FACTS STATEMENT — FINAL" : "LOAN KEY FACTS STATEMENT";
  const cursor = newPage(doc, fonts, data.applicationRef, title);

  drawParagraph(
    cursor,
    data.applicationRef,
    "This statement sets out the key terms of your loan in a standard format, so you can compare " +
      "it with offers from other lenders before you decide. It does not itself create any binding " +
      "obligation to lend or borrow."
  );

  const totalRepayable = data.monthlyRepayment * data.termMonths;
  const totalCostOfCredit = totalRepayable - data.loanAmount;

  drawSectionHeading(cursor, data.applicationRef, "1. Lender");
  drawKeyValueRow(cursor, data.applicationRef, "Lender", "DigiLend Ltd, regulated under Israeli Banking Law 5761-2000");
  drawKeyValueRow(cursor, data.applicationRef, "Registered No.", "51-234567-8");
  drawKeyValueRow(cursor, data.applicationRef, "Borrower", data.customerName);

  drawSectionHeading(cursor, data.applicationRef, "2. Main Features of the Credit Product");
  drawKeyValueRow(cursor, data.applicationRef, "Type of credit", "Personal loan, fixed instalments");
  drawKeyValueRow(cursor, data.applicationRef, "Product", data.productName);
  drawKeyValueRow(cursor, data.applicationRef, "Total amount of credit", money(data.loanAmount));
  drawKeyValueRow(cursor, data.applicationRef, "Duration of agreement", `${data.termMonths} months`);
  drawKeyValueRow(
    cursor,
    data.applicationRef,
    "Instalments",
    `${data.termMonths} monthly instalments of ${money(data.monthlyRepayment)}, due the same calendar day each month`
  );
  drawKeyValueRow(cursor, data.applicationRef, "Total amount payable", money(totalRepayable));

  drawSectionHeading(cursor, data.applicationRef, "3. Cost of the Credit");
  drawKeyValueRow(cursor, data.applicationRef, "Interest rate", `${data.interestRate}% APR, fixed for the full term`);
  drawKeyValueRow(cursor, data.applicationRef, "Total cost of credit", money(totalCostOfCredit));
  drawParagraph(
    cursor,
    data.applicationRef,
    `Representative example: borrowing ${money(data.loanAmount)} over ${data.termMonths} months at ${data.interestRate}% APR ` +
      `(fixed) means ${data.termMonths} monthly repayments of ${money(data.monthlyRepayment)}, ` +
      `total repayable ${money(totalRepayable)}.`
  );

  drawSectionHeading(cursor, data.applicationRef, "4. Right of Withdrawal");
  drawParagraph(
    cursor,
    data.applicationRef,
    "You have the right to withdraw from this credit agreement without giving any reason within 14 calendar " +
      "days of the agreement being executed. To exercise this right, contact your DigiLend advisor before the " +
      "withdrawal period ends. If you withdraw, you must repay the capital drawn down without undue delay, " +
      "together with interest accrued up to the date of repayment."
  );

  drawSectionHeading(cursor, data.applicationRef, "5. Early Repayment");
  drawParagraph(
    cursor,
    data.applicationRef,
    "You are entitled to repay this loan early, in full or in part, at any time. On early repayment, you are " +
      "entitled to a reduction in the total cost of credit, consisting of the interest for the remaining " +
      "term of the agreement. No early repayment charge applies."
  );

  drawSectionHeading(cursor, data.applicationRef, "6. Consequences of Missing Payments");
  drawParagraph(
    cursor,
    data.applicationRef,
    "Missing a payment may have severe consequences (e.g. forced sale of assets securing the loan, where " +
      "applicable) and make obtaining credit more difficult. DigiLend will apply the default interest rate " +
      "set out in your loan agreement to overdue amounts and may report late or missed payments to credit " +
      "reference agencies."
  );

  drawFooterDisclaimer(cursor, data.applicationRef, ILLUSTRATIVE_NOTICE);

  return doc.save();
}
