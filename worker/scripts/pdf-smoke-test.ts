import { writeFileSync } from "fs";
import { generateApprovalLetterPdf } from "../src/lib/pdf/approval-letter";

const bytes = await generateApprovalLetterPdf(
  {
    applicationRef: "DGB-2026-99999",
    customerName: "Dana Cohen",
    loanAmount: 20000,
    productName: "Standard Personal Loan",
    interestRate: 5.5,
    termMonths: 36,
    monthlyRepayment: 604.17,
  },
  true
);

writeFileSync("pdf-smoke-test-output.pdf", bytes);
console.log("bytes:", bytes.byteLength);
console.log("starts with %PDF:", Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-");
