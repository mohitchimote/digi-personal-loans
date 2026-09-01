import { PDFDocument } from "pdf-lib";
import {
  embedFonts,
  newPage,
  ensureSpace,
  drawParagraph,
  drawFooterDisclaimer,
  money,
  ILLUSTRATIVE_NOTICE,
  MARGIN_X,
  CONTENT_WIDTH,
  TCS_BLUE,
  LIGHT_GREY,
  BLACK,
  type PageCursor,
} from "./pdf-common";

export interface RepaymentScheduleData {
  applicationRef: string;
  customerName: string;
  loanAmount: number;
  interestRate: number;
  termMonths: number;
  monthlyRepayment: number;
}

interface ScheduleRow {
  paymentNumber: number;
  dueDate: Date;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

// Standard reducing-balance amortisation: each instalment's interest portion is the outstanding
// balance times the monthly rate, and the remainder pays down principal. The final row is clamped
// to zero rather than trusting the fixed instalment amount, since rounding across `termMonths`
// periods otherwise drifts the closing balance a few agorot off zero.
function buildSchedule(data: RepaymentScheduleData): ScheduleRow[] {
  const monthlyRate = data.interestRate / 100 / 12;
  let balance = data.loanAmount;
  const rows: ScheduleRow[] = [];
  const today = new Date();

  for (let i = 1; i <= data.termMonths; i++) {
    const interest = balance * monthlyRate;
    let principal = data.monthlyRepayment - interest;
    let payment = data.monthlyRepayment;
    if (i === data.termMonths || principal > balance) {
      principal = balance;
      payment = principal + interest;
    }
    balance = Math.max(0, balance - principal);

    const dueDate = new Date(today.getFullYear(), today.getMonth() + i, today.getDate());
    rows.push({ paymentNumber: i, dueDate, payment, principal, interest, balance });
  }
  return rows;
}

const COL_X = { num: MARGIN_X, date: MARGIN_X + 40, payment: MARGIN_X + 140, principal: MARGIN_X + 230, interest: MARGIN_X + 320, balance: MARGIN_X + 410 };

function drawTableHeader(cursor: PageCursor): void {
  ensureSpace(cursor, cursor.title, 20);
  cursor.page.drawRectangle({ x: MARGIN_X, y: cursor.y - 4, width: CONTENT_WIDTH, height: 16, color: LIGHT_GREY });
  const size = 8;
  cursor.page.drawText("#", { x: COL_X.num + 4, y: cursor.y, size, font: cursor.fonts.bold, color: TCS_BLUE });
  cursor.page.drawText("Due Date", { x: COL_X.date, y: cursor.y, size, font: cursor.fonts.bold, color: TCS_BLUE });
  cursor.page.drawText("Payment", { x: COL_X.payment, y: cursor.y, size, font: cursor.fonts.bold, color: TCS_BLUE });
  cursor.page.drawText("Principal", { x: COL_X.principal, y: cursor.y, size, font: cursor.fonts.bold, color: TCS_BLUE });
  cursor.page.drawText("Interest", { x: COL_X.interest, y: cursor.y, size, font: cursor.fonts.bold, color: TCS_BLUE });
  cursor.page.drawText("Balance", { x: COL_X.balance, y: cursor.y, size, font: cursor.fonts.bold, color: TCS_BLUE });
  cursor.y -= 18;
}

function drawTableRow(cursor: PageCursor, row: ScheduleRow): void {
  ensureSpace(cursor, cursor.title, 14);
  const size = 8;
  const dateStr = row.dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  cursor.page.drawText(String(row.paymentNumber), { x: COL_X.num + 4, y: cursor.y, size, font: cursor.fonts.regular, color: BLACK });
  cursor.page.drawText(dateStr, { x: COL_X.date, y: cursor.y, size, font: cursor.fonts.regular, color: BLACK });
  cursor.page.drawText(money(row.payment), { x: COL_X.payment, y: cursor.y, size, font: cursor.fonts.regular, color: BLACK });
  cursor.page.drawText(money(row.principal), { x: COL_X.principal, y: cursor.y, size, font: cursor.fonts.regular, color: BLACK });
  cursor.page.drawText(money(row.interest), { x: COL_X.interest, y: cursor.y, size, font: cursor.fonts.regular, color: BLACK });
  cursor.page.drawText(money(row.balance), { x: COL_X.balance, y: cursor.y, size, font: cursor.fonts.regular, color: BLACK });
  cursor.y -= 13;
}

export async function generateRepaymentSchedulePdf(data: RepaymentScheduleData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  const cursor = newPage(doc, fonts, data.applicationRef, "REPAYMENT SCHEDULE");

  const totalRepayable = data.monthlyRepayment * data.termMonths;
  drawParagraph(
    cursor,
    data.applicationRef,
    `Illustrative month-by-month repayment schedule for ${data.customerName}'s loan of ${money(data.loanAmount)} ` +
      `over ${data.termMonths} months at ${data.interestRate}% APR (fixed), totalling ${money(totalRepayable)} repayable. ` +
      "Actual due dates will be confirmed in your loan agreement and may shift slightly to align with your " +
      "chosen payment date each month."
  );

  const schedule = buildSchedule(data);
  drawTableHeader(cursor);
  for (const row of schedule) {
    // Repeat the header at the top of each new page a row spills onto, so a reader landing
    // mid-table via scroll/print never loses track of which column is which.
    if (cursor.y - 13 < 60 + 20) {
      const fresh = newPage(doc, fonts, data.applicationRef, cursor.title);
      cursor.page = fresh.page;
      cursor.y = fresh.y;
      drawTableHeader(cursor);
    }
    drawTableRow(cursor, row);
  }

  cursor.y -= 10;
  drawFooterDisclaimer(cursor, data.applicationRef, ILLUSTRATIVE_NOTICE);

  return doc.save();
}
