import { PDFDocument } from "pdf-lib";
import { embedFonts, newPage, drawSectionHeading, drawParagraph, drawFooterDisclaimer, ILLUSTRATIVE_NOTICE } from "./pdf-common";

// Generic personal-loan T&Cs shell — same structure/coverage a UK consumer-credit T&Cs document
// would have (definitions, the facility, interest, repayment, default, cancellation, data
// protection, complaints, governing law), adapted to reference Israeli law. Illustrative
// placeholder wording only — see ILLUSTRATIVE_NOTICE.

export interface TermsData {
  applicationRef: string;
  customerName: string;
  productName: string;
}

const SECTIONS: [string, string][] = [
  [
    "1. Definitions",
    '"Agreement" means the loan agreement between you and DigiLend Ltd ("DigiLend", "we", "us"), including ' +
      "these Terms and the Key Facts Statement. \"You\" means the borrower named in the Agreement. " +
      '"Loan" means the amount of credit made available to you under the Agreement.',
  ],
  [
    "2. The Loan Facility",
    "We will make the Loan available by transferring the agreed amount to your nominated account once all " +
      "conditions of approval have been satisfied, including verification of your identity and supporting " +
      "documentation. We may decline to release funds if any information you provided is found to be " +
      "materially inaccurate or incomplete.",
  ],
  [
    "3. Interest",
    "Interest accrues daily on the outstanding balance at the fixed annual rate stated in your Key Facts " +
      "Statement, calculated on a reducing-balance basis. The rate is fixed for the full term of the Agreement " +
      "and will not change unless you and DigiLend agree in writing to vary the Agreement.",
  ],
  [
    "4. Repayment",
    "You must repay the Loan in the monthly instalments set out in your Repayment Schedule, by direct debit " +
      "or standing order from the account you nominated when accepting this offer. Each instalment is due on " +
      "the same calendar day each month; if that day does not exist in a given month, payment is due on the " +
      "last day of that month.",
  ],
  [
    "5. Early Settlement",
    "You may repay all or part of the outstanding balance at any time without penalty. Written notice to your " +
      "DigiLend advisor at least 5 business days beforehand is appreciated so we can prepare an accurate " +
      "settlement figure, but is not a condition of your right to repay early.",
  ],
  [
    "6. Default and Consequences",
    "If you miss a scheduled payment, we will apply the default interest rate disclosed in your Key Facts " +
      "Statement to the overdue amount from the due date until payment is received. We may report missed or " +
      "late payments to licensed credit reference agencies, which can affect your ability to obtain credit " +
      "in future. If you fall three or more instalments into arrears, we may declare the full outstanding " +
      "balance immediately due and payable, subject to any statutory notice requirements.",
  ],
  [
    "7. Right of Cancellation",
    "You may withdraw from this Agreement without giving any reason within 14 calendar days of it being " +
      "executed, as described in your Key Facts Statement. Outside that period, this Agreement may only be " +
      "ended early by full repayment under Section 5.",
  ],
  [
    "8. Changes to These Terms",
    "We may vary these Terms where required by law or regulation, or to reflect a change in our operating " +
      "costs, provided any change does not increase the interest rate fixed at the start of your Agreement. " +
      "We will give you at least 30 days' written notice of any such change.",
  ],
  [
    "9. Data Protection and Credit Reference Agencies",
    "We process your personal data to assess this application, administer the Loan, and comply with our " +
      "regulatory obligations, in accordance with applicable Israeli data protection law and the consents you " +
      "gave during your application. We share information about your conduct of this account with licensed " +
      "credit reference agencies on an ongoing basis.",
  ],
  [
    "10. Complaints",
    "If you are unhappy with any aspect of this Agreement or our service, contact your DigiLend advisor in " +
      "the first instance. If your complaint is not resolved to your satisfaction, you may escalate it " +
      "through DigiLend's formal complaints procedure, details of which are available on request.",
  ],
  [
    "11. Governing Law",
    "This Agreement is governed by the laws of the State of Israel, including the Banking Law (Customer " +
      "Service) 5741-1981 and the Fair Credit Law 5754-1993, and is subject to the exclusive jurisdiction of " +
      "the competent courts of Israel.",
  ],
];

export async function generateTermsAndConditionsPdf(data: TermsData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  const cursor = newPage(doc, fonts, data.applicationRef, "PERSONAL LOAN — TERMS AND CONDITIONS");

  drawParagraph(
    cursor,
    data.applicationRef,
    `These Terms and Conditions apply to the ${data.productName} offered to ${data.customerName} and form part ` +
      "of your loan Agreement with DigiLend, together with your Key Facts Statement and Repayment Schedule."
  );

  for (const [heading, body] of SECTIONS) {
    drawSectionHeading(cursor, data.applicationRef, heading);
    drawParagraph(cursor, data.applicationRef, body);
  }

  drawFooterDisclaimer(cursor, data.applicationRef, ILLUSTRATIVE_NOTICE);

  return doc.save();
}
