import type { LetterDocument } from "./types";

// A small but complete letter built only from fields in the live dictionary. It is the starter template
// the admin can copy, and what the renderer tests and previews use.

const bi = (en: string, he: string) => ({ en, he });

export const SAMPLE_LETTER: LetterDocument = {
  formatVersion: 1,
  header: [
    { id: "h1", t: "paragraph", text: bi("DigiBank · Application {{application.reference}}", "דיגיבנק · בקשה {{application.reference}}") },
  ],
  body: [
    { id: "b1", t: "heading", align: "center", text: bi("Key features of your loan", "מאפיינים עיקריים של ההלוואה") },
    { id: "b2", t: "paragraph", text: bi("Dear {{customer.name}}, this letter summarises the <b>main terms</b> of the loan we are offering you for <i>{{loan.purpose}}</i>.", "{{customer.name}} שלום, מכתב זה מסכם את <b>עיקרי התנאים</b> של ההלוואה שאנו מציעים לך עבור <i>{{loan.purpose}}</i>.") },
    { id: "b3", t: "table", rows: [
      { label: bi("Loan amount", "סכום ההלוואה"), value: bi("{{loan.amount}}", "{{loan.amount}}") },
      { label: bi("Term", "משך ההלוואה"), value: bi("{{loan.termMonths}}", "{{loan.termMonths}}") },
      { label: bi("Annual interest rate", "ריבית שנתית"), value: bi("{{loan.annualRate}}", "{{loan.annualRate}}") },
      { label: bi("Monthly repayment", "החזר חודשי"), value: bi("{{calculated.monthlyRepayment}}", "{{calculated.monthlyRepayment}}") },
      { label: bi("Total amount to repay", "סך כל הסכום להחזר"), value: bi("{{calculated.totalPayable}}", "{{calculated.totalPayable}}") },
    ] },
    { id: "b4", t: "when", rule: { t: "condition", field: "guarantor.required", op: "isYes" }, children: [
      { id: "b4a", t: "paragraph", text: bi("A guarantor is required for this loan: {{guarantor.name}}.", "נדרש ערב להלוואה זו: {{guarantor.name}}.") },
    ] },
    { id: "b4b", t: "list", ordered: true, items: [
      { en: "Repayments are made monthly by direct debit.", he: "ההחזרים מתבצעים מדי חודש בהוראת קבע." },
      { en: "You may repay early. <u>Fees may apply.</u>", he: "ניתן לפרוע מראש. <u>ייתכנו עמלות.</u>", level: 1 },
      { en: "Late payment may affect your credit record.", he: "איחור בתשלום עלול להשפיע על דירוג האשראי." },
    ] },
    { id: "b4c", t: "paragraph", indent: 1, text: bi("<b>Important:</b> the rate may change. Read the full terms before you sign.", "<b>חשוב:</b> הריבית עשויה להשתנות. קראו את התנאים המלאים לפני החתימה.") },
    { id: "b5", t: "heading", text: bi("Borrowers", "לווים") },
    { id: "b6", t: "repeat", over: "applicants", where: null, children: [
      { id: "b6a", t: "paragraph", text: bi("{{item.fullName}} ({{item.role}})", "{{item.fullName}} ({{item.role}})") },
    ] },
    { id: "b7", t: "signature", caption: bi("DigiBank Ltd, authorised signatory", "דיגיבנק בע״מ, מורשה חתימה") },
  ],
  footer: [
    { id: "f1", t: "paragraph", text: bi("DigiBank Ltd · Page {{page.number}} of {{page.total}}", "דיגיבנק בע״מ · עמוד {{page.number}} מתוך {{page.total}}") },
  ],
};

export const SAMPLE_DATA = {
  application: { reference: "DGB-2026-90531", type: "PERSONAL" },
  customer: { name: "Noa Levi" },
  loan: { purpose: { en: "Home improvement", he: "שיפוץ הבית" }, amount: 150000, termMonths: 60, annualRate: 5.4 },
  calculated: { monthlyRepayment: 2858.25, totalPayable: 171495 },
  guarantor: { required: true, name: "Dan Levi" },
  applicants: [{ fullName: "Noa Levi", role: "MAIN" }, { fullName: "Daniel Levi", role: "JOINT" }],
};
