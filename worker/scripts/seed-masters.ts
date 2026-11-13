/**
 * Generates seed-masters.sql: the built-in master types and their starting items. Idempotent
 * (INSERT OR IGNORE on the unique keys), so re-running never overwrites an admin's edits.
 *   npx tsx scripts/seed-masters.ts > seed-masters.sql
 *   npx wrangler d1 execute digibank --local  --file=./seed-masters.sql
 *   npx wrangler d1 execute digibank --remote --file=./seed-masters.sql
 * Country/nationality lists are a common-case starting point, not the full ISO list: admins extend
 * them in the Masters screen.
 */

import { ISO_COUNTRIES } from "./lib/iso-countries";

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
const now = new Date().toISOString();

type Attr = { key: string; label: { en: string; he: string }; kind: "text" | "number" | "boolean"; required?: boolean };
interface TypeSeed { code: string; en: string; he: string; desc: string; parent?: string; parentOptional?: boolean; attrs?: Attr[] }
type Row = [code: string, en: string, he: string, extra?: { parent?: string; attrs?: Record<string, unknown> }];

const TYPES: TypeSeed[] = [
  { code: "title", en: "Title", he: "תואר פנייה", desc: "Mr, Mrs, Dr ..." },
  { code: "gender", en: "Gender", he: "מגדר", desc: "" },
  { code: "marital_status", en: "Marital Status", he: "מצב משפחתי", desc: "" },
  { code: "nationality", en: "Nationality", he: "אזרחות", desc: "" },
  { code: "country", en: "Country", he: "מדינה", desc: "" },
  { code: "state", en: "State / District", he: "מחוז / מדינה פדרלית", desc: "", parent: "country" },
  { code: "city", en: "City", he: "עיר", desc: "", parent: "state" },
  { code: "region", en: "Region", he: "אזור", desc: "Operational regions of the bank." },
  { code: "zone", en: "Zone", he: "אזור משנה", desc: "", parent: "region" },
  { code: "branch", en: "Branch", he: "סניף", desc: "Reused by organisation setup and forms.", parent: "zone", parentOptional: true,
    attrs: [
      { key: "address", label: { en: "Address", he: "כתובת" }, kind: "text" },
      { key: "phone", label: { en: "Phone", he: "טלפון" }, kind: "text" },
    ] },
  { code: "employment_status", en: "Employment Status", he: "מצב תעסוקתי", desc: "" },
  { code: "employment_duration", en: "Employment Duration", he: "משך העסקה", desc: "Time in current employment." },
  { code: "residential_status", en: "Residential Status", he: "סטטוס מגורים", desc: "" },
  { code: "education_level", en: "Education Level", he: "השכלה", desc: "" },
  { code: "income_source", en: "Income Source", he: "מקור הכנסה", desc: "" },
  { code: "id_document_type", en: "ID Document Type", he: "סוג מסמך זיהוי", desc: "" },
  { code: "relationship", en: "Relationship", he: "קרבה", desc: "To the applicant: references, next of kin, signatories." },
  { code: "loan_purpose", en: "Loan Purpose", he: "מטרת ההלוואה", desc: "Personal loans." },
  { code: "business_loan_purpose", en: "Business Loan Purpose", he: "מטרת הלוואה עסקית", desc: "Business loans." },
  { code: "document_type", en: "Document Type", he: "סוג מסמך", desc: "Supporting documents the applicant uploads.",
    attrs: [{ key: "segment", label: { en: "Applies to (personal / business)", he: "חל על (פרטי / עסקי)" }, kind: "text" }] },
  { code: "decline_reason", en: "Decline Reason", he: "סיבת דחייה", desc: "Staff: why an application was declined." },
  { code: "send_back_reason", en: "Send-back Reason", he: "סיבת החזרה", desc: "Staff: why an application was sent back to the customer." },
  { code: "bank", en: "Bank", he: "בנק", desc: "External banks, for direct debit. Source: Bank of Israel." },
  { code: "bank_branch", en: "Bank Branch", he: "סניף בנק", desc: "Source: Bank of Israel branch directory.", parent: "bank",
    attrs: [
      { key: "branchCode", label: { en: "Branch code", he: "מספר סניף" }, kind: "text" },
      { key: "address", label: { en: "Address", he: "כתובת" }, kind: "text" },
      { key: "city", label: { en: "City", he: "עיר" }, kind: "text" },
      { key: "phone", label: { en: "Phone", he: "טלפון" }, kind: "text" },
    ] },
  { code: "legal_entity_type", en: "Legal Entity Type", he: "סוג תאגיד", desc: "Business applications." },
  { code: "industry_sector", en: "Industry Sector", he: "ענף", desc: "Business applications." },
  { code: "address_type", en: "Address Type", he: "סוג כתובת", desc: "" },
  { code: "language", en: "Language", he: "שפה", desc: "" },
  { code: "currency", en: "Currency", he: "מטבע", desc: "",
    attrs: [{ key: "symbol", label: { en: "Symbol", he: "סימן" }, kind: "text" }] },
];

const SIMPLE: Record<string, Row[]> = {
  title: [["MR", "Mr", "מר"], ["MRS", "Mrs", "גב׳"], ["MS", "Ms", "גב׳"], ["DR", "Dr", "ד״ר"], ["PROF", "Prof", "פרופ׳"]],
  gender: [["MALE", "Male", "זכר"], ["FEMALE", "Female", "נקבה"], ["OTHER", "Other", "אחר"], ["NOT_SAID", "Prefer not to say", "מעדיף/ה שלא לציין"]],
  marital_status: [["SINGLE", "Single", "רווק/ה"], ["MARRIED", "Married", "נשוי/אה"], ["DIVORCED", "Divorced", "גרוש/ה"],
    ["WIDOWED", "Widowed", "אלמן/ה"], ["CIVIL_PARTNERSHIP", "Civil Partnership", "ידוע/ה בציבור"], ["SEPARATED", "Separated", "פרוד/ה"]],
  employment_status: [["FULL_TIME", "Full-Time Employed", "שכיר/ה במשרה מלאה"], ["PART_TIME", "Part-Time Employed", "שכיר/ה במשרה חלקית"],
    ["SELF_EMPLOYED", "Self-Employed", "עצמאי/ת"], ["CONTRACT", "Contract", "עובד/ת בחוזה"], ["RETIRED", "Retired", "פנסיונר/ית"],
    ["STUDENT", "Student", "סטודנט/ית"], ["UNEMPLOYED", "Unemployed", "מובטל/ת"]],
  employment_duration: [["LT_6M", "Less than 6 months", "פחות מ-6 חודשים"], ["M6_12", "6–12 months", "6–12 חודשים"], ["Y1_2", "1–2 years", "1–2 שנים"],
    ["Y2_5", "2–5 years", "2–5 שנים"], ["Y5_PLUS", "5+ years", "5 שנים ומעלה"]],
  residential_status: [["OWNER", "Owner (no mortgage)", "בעל/ת דירה"], ["MORTGAGED", "Owner with mortgage", "בעל/ת דירה עם משכנתא"],
    ["RENTING", "Renting", "שוכר/ת"], ["WITH_FAMILY", "Living with family", "גר/ה עם משפחה"], ["OTHER", "Other", "אחר"]],
  education_level: [["HIGH_SCHOOL", "High school", "תיכונית"], ["DIPLOMA", "Diploma / technician", "תעודה / הנדסאי"], ["BACHELOR", "Bachelor's degree", "תואר ראשון"],
    ["MASTER", "Master's degree", "תואר שני"], ["DOCTORATE", "Doctorate", "דוקטורט"], ["OTHER", "Other", "אחר"]],
  income_source: [["SALARY", "Salary", "משכורת"], ["BUSINESS", "Business income", "הכנסה מעסק"], ["PENSION", "Pension", "פנסיה"],
    ["RENTAL", "Rental income", "הכנסה משכירות"], ["INVESTMENTS", "Investments", "השקעות"], ["BENEFITS", "Benefits", "קצבאות"]],
  id_document_type: [["NATIONAL_ID", "National ID", "תעודת זהות"], ["PASSPORT", "Passport", "דרכון"],
    ["DRIVING_LICENCE", "Driving licence", "רישיון נהיגה"], ["RESIDENCE_PERMIT", "Residence permit", "אשרת שהייה"]],
  relationship: [["SPOUSE", "Spouse / partner", "בן/בת זוג"], ["PARENT", "Parent", "הורה"], ["CHILD", "Child", "ילד/ה"], ["SIBLING", "Sibling", "אח/אחות"],
    ["FRIEND", "Friend", "חבר/ה"], ["COLLEAGUE", "Colleague", "עמית לעבודה"], ["OTHER", "Other", "אחר"]],
  loan_purpose: [["HOME_IMPROVEMENT", "Home Improvement", "שיפוץ הבית"], ["DEBT_CONSOLIDATION", "Debt Consolidation", "איחוד הלוואות"],
    ["VEHICLE_PURCHASE", "Vehicle Purchase", "רכישת רכב"], ["EDUCATION", "Education", "לימודים"], ["MEDICAL_EXPENSES", "Medical Expenses", "הוצאות רפואיות"],
    ["WEDDING", "Wedding", "חתונה"], ["TRAVEL", "Travel", "נסיעות"], ["BUSINESS", "Business", "עסק"], ["OTHER", "Other", "אחר"]],
  business_loan_purpose: [["WORKING_CAPITAL", "Working Capital", "הון חוזר"], ["EQUIPMENT_PURCHASE", "Equipment Purchase", "רכישת ציוד"],
    ["BUSINESS_EXPANSION", "Business Expansion", "הרחבת העסק"], ["INVENTORY_FINANCING", "Inventory Financing", "מימון מלאי"],
    ["DEBT_REFINANCING", "Debt Refinancing", "מיחזור חובות"], ["COMMERCIAL_PROPERTY", "Commercial Property", "נכס מסחרי"], ["OTHER", "Other", "אחר"]],
  document_type: [
    ["NATIONAL_ID", "National ID", "תעודת זהות", { attrs: { segment: "personal" } }], ["PAYSLIPS", "Payslips", "תלושי שכר", { attrs: { segment: "personal" } }],
    ["BANK_STATEMENTS", "Bank Statements", "דפי חשבון בנק", { attrs: { segment: "personal" } }], ["PROOF_OF_ADDRESS", "Proof of Address", "אישור כתובת", { attrs: { segment: "personal" } }],
    ["CERTIFICATE_OF_INCORPORATION", "Certificate of Incorporation", "תעודת התאגדות", { attrs: { segment: "business" } }],
    ["FINANCIAL_STATEMENTS", "Financial Statements", "דוחות כספיים", { attrs: { segment: "business" } }],
    ["BUSINESS_BANK_STATEMENTS", "Business Bank Statements", "דפי חשבון בנק עסקי", { attrs: { segment: "business" } }]],
  decline_reason: [["AFFORDABILITY", "Affordability", "יכולת החזר"], ["CREDIT_HISTORY", "Credit history", "היסטוריית אשראי"],
    ["INCOMPLETE_DOCUMENTS", "Incomplete documents", "מסמכים חסרים"], ["IDENTITY_NOT_VERIFIED", "Identity could not be verified", "לא ניתן לאמת זהות"],
    ["POLICY", "Outside lending policy", "מחוץ למדיניות האשראי"], ["OTHER", "Other", "אחר"]],
  send_back_reason: [["MISSING_DOCUMENT", "Missing document", "מסמך חסר"], ["INCONSISTENT_INFORMATION", "Inconsistent information", "מידע לא עקבי"],
    ["NEEDS_CLARIFICATION", "Needs clarification", "נדרש הבהרה"], ["OTHER", "Other", "אחר"]],
  legal_entity_type: [["PRIVATE_COMPANY", "Private company", "חברה פרטית"], ["PUBLIC_COMPANY", "Public company", "חברה ציבורית"],
    ["PARTNERSHIP", "Partnership", "שותפות"], ["SOLE_PROPRIETOR", "Sole proprietor", "עוסק מורשה / יחיד"],
    ["NONPROFIT", "Non-profit", "עמותה"], ["COOPERATIVE", "Cooperative society", "אגודה שיתופית"]],
  industry_sector: [["RETAIL", "Retail", "קמעונאות"], ["MANUFACTURING", "Manufacturing", "ייצור"], ["CONSTRUCTION", "Construction", "בנייה"],
    ["TECHNOLOGY", "Technology", "טכנולוגיה"], ["HEALTHCARE", "Healthcare", "בריאות"], ["FINANCE", "Finance", "פיננסים"],
    ["HOSPITALITY", "Hospitality & tourism", "אירוח ותיירות"], ["TRANSPORT", "Transport & logistics", "תחבורה ולוגיסטיקה"],
    ["AGRICULTURE", "Agriculture", "חקלאות"], ["EDUCATION", "Education", "חינוך"],
    ["PROFESSIONAL_SERVICES", "Professional services", "שירותים מקצועיים"], ["REAL_ESTATE", "Real estate", "נדל״ן"], ["OTHER", "Other", "אחר"]],
  address_type: [["HOME", "Home", "מגורים"], ["WORK", "Work", "עבודה"], ["MAILING", "Mailing", "למשלוח דואר"], ["REGISTERED", "Registered office", "משרד רשום"]],
  language: [["EN", "English", "אנגלית"], ["HE", "Hebrew", "עברית"], ["AR", "Arabic", "ערבית"], ["RU", "Russian", "רוסית"]],
  currency: [["ILS", "Israeli shekel", "שקל חדש", { attrs: { symbol: "₪" } }], ["USD", "US dollar", "דולר אמריקאי", { attrs: { symbol: "$" } }],
    ["EUR", "Euro", "אירו", { attrs: { symbol: "€" } }], ["GBP", "Pound sterling", "לירה שטרלינג", { attrs: { symbol: "£" } }]],
};

const out: string[] = ["-- Generated by scripts/seed-masters.ts - do not edit by hand; edit the script. Idempotent.", ""];

TYPES.forEach((t, i) => {
  out.push(
    `INSERT OR IGNORE INTO master_types (code, label_en, label_he, description, parent_type_code, parent_required, attribute_defs, is_system, sort_order, created_at) ` +
    `VALUES (${q(t.code)}, ${q(t.en)}, ${q(t.he)}, ${t.desc ? q(t.desc) : "NULL"}, ${t.parent ? q(t.parent) : "NULL"}, ${t.parentOptional ? 0 : 1}, ${q(JSON.stringify(t.attrs ?? []))}, 1, ${(i + 1) * 10}, ${q(now)});`,
  );
});
out.push("");

// refreshNames: also bring names of already-seeded rows up to date, but only rows an admin has never
// edited (updated_at IS NULL), so manual changes in the Masters screen are never overwritten.
function items(type: string, rows: Row[], parentType?: string, refreshNames = false) {
  rows.forEach(([code, en, he, extra], i) => {
    const parent = extra?.parent && parentType
      ? `(SELECT id FROM master_items WHERE type_code = ${q(parentType)} AND code = ${q(extra.parent)})` : "NULL";
    out.push(
      `INSERT ${refreshNames ? "" : "OR IGNORE "}INTO master_items (type_code, code, name_en, name_he, parent_id, sort_order, active, attributes, created_at) ` +
      `VALUES (${q(type)}, ${q(code)}, ${q(en)}, ${q(he)}, ${parent}, ${(i + 1) * 10}, 1, ${q(JSON.stringify(extra?.attrs ?? {}))}, ${q(now)})` +
      (refreshNames ? ` ON CONFLICT(type_code, code) DO UPDATE SET name_en = excluded.name_en, name_he = excluded.name_he, sort_order = excluded.sort_order WHERE master_items.updated_at IS NULL;` : ";"),
    );
  });
  out.push("");
}

// The bank's own customer-facing branches (what the forms' "preferred branch" list uses today).
SIMPLE.branch = [
  ["TLV-ROTHSCHILD", "Tel Aviv - Rothschild Blvd", "תל אביב - שדרות רוטשילד"], ["JLM-JAFFA", "Jerusalem - Jaffa Road", "ירושלים - רחוב יפו"],
  ["HFA-HADAR", "Haifa - Hadar", "חיפה - הדר"], ["BS-OLDCITY", "Beer Sheva - Old City", "באר שבע - העיר העתיקה"],
  ["NTN-CENTER", "Netanya - City Center", "נתניה - מרכז העיר"], ["ETH-TOURIST", "Eilat - Tourist Center", "אילת - מרכז התיירות"],
];
for (const [type, rows] of Object.entries(SIMPLE)) items(type, rows);
items("country", [...ISO_COUNTRIES].sort((a, b) => a[1].localeCompare(b[1], "en")).map(([c, en, he]) => [c, en, he] as Row), undefined, true);

console.log(out.join("\n"));
