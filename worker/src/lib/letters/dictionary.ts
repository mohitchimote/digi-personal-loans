import type { Dictionary, FieldMeta } from "./types";

// The fields a letter can use, as the platform actually has them. Letter templates are checked against
// this and the editor offers exactly these. Values are produced by buildLetterData (data.ts); fields marked
// "stored on application" are the backend-calculated ones (lib/calculated.ts).

const L = (en: string, he: string) => ({ en, he });
const f = (en: string, he: string, type: FieldMeta["type"], extra: Partial<FieldMeta> = {}): FieldMeta => ({ label: L(en, he), type, ...extra });

export const LETTER_DICTIONARY: Dictionary = {
  formatVersion: 1,
  fields: {
    "application.reference": f("Application reference", "מספר בקשה", "text"),
    "application.type": f("Application type", "סוג בקשה", "choice", { choices: [{ v: "PERSONAL", en: "Personal", he: "פרטי" }, { v: "BUSINESS", en: "Business", he: "עסקי" }] }),
    "application.submittedAt": f("Submitted on", "הוגשה בתאריך", "date"),

    "customer.name": f("Customer name", "שם הלקוח", "text"),
    "customer.email": f("Customer email", "דוא״ל הלקוח", "text"),
    "customer.phone": f("Customer phone", "טלפון הלקוח", "text"),
    "customer.address": f("Customer address", "כתובת הלקוח", "text"),

    "applicants": f("Applicants", "מבקשים", "list", { itemFields: {
      fullName: f("Full name", "שם מלא", "text"),
      role: f("Role", "תפקיד", "choice", { choices: [{ v: "MAIN", en: "Main borrower", he: "לווה ראשי" }, { v: "JOINT", en: "Joint borrower", he: "לווה במשותף" }] }),
      dateOfBirth: f("Date of birth", "תאריך לידה", "date"),
      nationalId: f("National ID", "תעודת זהות", "text"),
      monthlyIncome: f("Monthly net income", "הכנסה חודשית נטו", "money"),
    } }),

    "company.name": f("Company name", "שם החברה", "text"),
    "company.registrationNumber": f("Company registration number", "מספר רישום החברה", "text"),
    "company.industry": f("Industry", "ענף", "text"),
    "company.yearFounded": f("Year founded", "שנת הקמה", "number", { fmt: "int" }),
    "company.address": f("Company address", "כתובת החברה", "text"),

    "loan.purpose": f("Loan purpose", "מטרת ההלוואה", "text"),
    "loan.requestedAmount": f("Amount requested", "סכום מבוקש", "money"),
    "loan.amount": f("Loan amount", "סכום ההלוואה", "money"),
    "loan.termMonths": f("Term", "תקופה", "number", { fmt: "term" }),
    "loan.annualRate": f("Annual rate", "ריבית שנתית", "percent"),

    "calculated.monthlyRepayment": f("Monthly repayment", "החזר חודשי", "money", { fmt: "money2" }),
    "calculated.totalPayable": f("Total amount to repay", "סך כל הסכום להחזר", "money", { fmt: "money2" }),
    "calculated.totalInterest": f("Total interest", "סך הריבית", "money", { fmt: "money2" }),
    "calculated.costPerShekel": f("Repay per ₪1 borrowed", "החזר על כל ₪1 שנלווה", "number", { fmt: "dec" }),

    "product.name": f("Product name", "שם המוצר", "text"),
    "branch.name": f("Branch", "סניף", "text"),

    "guarantor.required": f("Guarantor required", "נדרש ערב", "bool"),
    "guarantor.name": f("Guarantor name", "שם הערב", "text"),
    "guarantor.relationship": f("Guarantor relationship", "קרבת הערב", "text"),
    "guarantor.phone": f("Guarantor phone", "טלפון הערב", "text"),
    "guarantor.email": f("Guarantor email", "דוא״ל הערב", "text"),

    "decision.reason": f("Decision reason", "נימוק ההחלטה", "text"),
  },
};

/** Where each calculated value is stored, for the editor's "stored on application" tag. */
export const STORED_ON_APPLICATION = new Set(Object.keys(LETTER_DICTIONARY.fields).filter((k) => k.startsWith("calculated.")));
