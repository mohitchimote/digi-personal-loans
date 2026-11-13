/**
 * Generates seed-masters.sql: the built-in master types and their starting items. Idempotent
 * (INSERT OR IGNORE on the unique keys), so re-running never overwrites an admin's edits.
 *   npx tsx scripts/seed-masters.ts > seed-masters.sql
 *   npx wrangler d1 execute digibank --local  --file=./seed-masters.sql
 *   npx wrangler d1 execute digibank --remote --file=./seed-masters.sql
 * Country/nationality lists are a common-case starting point, not the full ISO list: admins extend
 * them in the Masters screen.
 */

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
const now = new Date().toISOString();

type Attr = { key: string; label: { en: string; he: string }; kind: "text" | "number" | "boolean"; required?: boolean };
interface TypeSeed { code: string; en: string; he: string; desc: string; parent?: string; attrs?: Attr[] }
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
  { code: "branch", en: "Branch", he: "סניף", desc: "Reused by organisation setup and forms.", parent: "zone",
    attrs: [
      { key: "address", label: { en: "Address", he: "כתובת" }, kind: "text" },
      { key: "phone", label: { en: "Phone", he: "טלפון" }, kind: "text" },
    ] },
  { code: "employment_status", en: "Employment Status", he: "מצב תעסוקתי", desc: "" },
  { code: "residential_status", en: "Residential Status", he: "סטטוס מגורים", desc: "" },
  { code: "education_level", en: "Education Level", he: "השכלה", desc: "" },
  { code: "income_source", en: "Income Source", he: "מקור הכנסה", desc: "" },
  { code: "id_document_type", en: "ID Document Type", he: "סוג מסמך זיהוי", desc: "" },
  { code: "relationship", en: "Relationship", he: "קרבה", desc: "To the applicant: references, next of kin, signatories." },
  { code: "loan_purpose", en: "Loan Purpose", he: "מטרת ההלוואה", desc: "" },
  { code: "legal_entity_type", en: "Legal Entity Type", he: "סוג תאגיד", desc: "Business applications." },
  { code: "industry_sector", en: "Industry Sector", he: "ענף", desc: "Business applications." },
  { code: "address_type", en: "Address Type", he: "סוג כתובת", desc: "" },
  { code: "language", en: "Language", he: "שפה", desc: "" },
  { code: "currency", en: "Currency", he: "מטבע", desc: "",
    attrs: [{ key: "symbol", label: { en: "Symbol", he: "סימן" }, kind: "text" }] },
];

const COUNTRIES: [string, string, string, string, string][] = [
  // code, country en, country he, nationality en, nationality he
  ["IL", "Israel", "ישראל", "Israeli", "ישראלי"], ["US", "United States", "ארצות הברית", "American", "אמריקאי"],
  ["GB", "United Kingdom", "בריטניה", "British", "בריטי"], ["FR", "France", "צרפת", "French", "צרפתי"],
  ["DE", "Germany", "גרמניה", "German", "גרמני"], ["RU", "Russia", "רוסיה", "Russian", "רוסי"],
  ["UA", "Ukraine", "אוקראינה", "Ukrainian", "אוקראיני"], ["ET", "Ethiopia", "אתיופיה", "Ethiopian", "אתיופי"],
  ["MA", "Morocco", "מרוקו", "Moroccan", "מרוקאי"], ["AR", "Argentina", "ארגנטינה", "Argentine", "ארגנטינאי"],
  ["CA", "Canada", "קנדה", "Canadian", "קנדי"], ["AU", "Australia", "אוסטרליה", "Australian", "אוסטרלי"],
  ["IN", "India", "הודו", "Indian", "הודי"], ["ES", "Spain", "ספרד", "Spanish", "ספרדי"],
  ["IT", "Italy", "איטליה", "Italian", "איטלקי"], ["NL", "Netherlands", "הולנד", "Dutch", "הולנדי"],
  ["CH", "Switzerland", "שווייץ", "Swiss", "שווייצי"], ["BE", "Belgium", "בלגיה", "Belgian", "בלגי"],
  ["PL", "Poland", "פולין", "Polish", "פולני"], ["RO", "Romania", "רומניה", "Romanian", "רומני"],
  ["TR", "Turkey", "טורקיה", "Turkish", "טורקי"], ["EG", "Egypt", "מצרים", "Egyptian", "מצרי"],
  ["JO", "Jordan", "ירדן", "Jordanian", "ירדני"], ["AE", "United Arab Emirates", "איחוד האמירויות", "Emirati", "אמירתי"],
  ["BR", "Brazil", "ברזיל", "Brazilian", "ברזילאי"], ["MX", "Mexico", "מקסיקו", "Mexican", "מקסיקני"],
  ["ZA", "South Africa", "דרום אפריקה", "South African", "דרום אפריקאי"], ["CN", "China", "סין", "Chinese", "סיני"],
  ["JP", "Japan", "יפן", "Japanese", "יפני"], ["GR", "Greece", "יוון", "Greek", "יווני"],
  ["CY", "Cyprus", "קפריסין", "Cypriot", "קפריסאי"], ["PT", "Portugal", "פורטוגל", "Portuguese", "פורטוגלי"],
  ["SE", "Sweden", "שוודיה", "Swedish", "שוודי"], ["AT", "Austria", "אוסטריה", "Austrian", "אוסטרי"],
  ["HU", "Hungary", "הונגריה", "Hungarian", "הונגרי"], ["CZ", "Czechia", "צ'כיה", "Czech", "צ'כי"],
  ["BG", "Bulgaria", "בולגריה", "Bulgarian", "בולגרי"], ["FI", "Finland", "פינלנד", "Finnish", "פיני"],
  ["NO", "Norway", "נורווגיה", "Norwegian", "נורווגי"], ["DK", "Denmark", "דנמרק", "Danish", "דני"],
  ["IE", "Ireland", "אירלנד", "Irish", "אירי"],
];


// ISO 3166-1 alpha-2: the 249 officially assigned codes. Names come from CLDR via the runtime's
// Intl.DisplayNames (English and Hebrew), so they are standard and need no hand translation.
// CLDR also knows non-country codes (EU, UN, XK, ...); this list is what keeps those out.
const ISO_3166_1 = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");
if (ISO_3166_1.length !== 249 || new Set(ISO_3166_1).size !== 249) throw new Error(`ISO list should be 249 unique codes, got ${ISO_3166_1.length}`);
const regionEn = new Intl.DisplayNames(["en"], { type: "region" });
const regionHe = new Intl.DisplayNames(["he"], { type: "region" });
const ISO_COUNTRIES: Row[] = ISO_3166_1.map((c) => {
  const en = regionEn.of(c), he = regionHe.of(c);
  if (!en || !he || en === c || he === c) throw new Error(`No CLDR name for ${c}`);
  return [c, en, he] as Row;
});

const DISTRICTS: Row[] = [
  ["IL-N", "Northern", "צפון"], ["IL-HA", "Haifa", "חיפה"], ["IL-M", "Central", "מרכז"], ["IL-TA", "Tel Aviv", "תל אביב"],
  ["IL-JM", "Jerusalem", "ירושלים"], ["IL-S", "Southern", "דרום"], ["IL-JS", "Judea and Samaria", "יהודה ושומרון"],
];
// [slug, en, he, district code]
const CITIES: [string, string, string, string][] = [
  ["jerusalem", "Jerusalem", "ירושלים", "IL-JM"], ["tel-aviv-yafo", "Tel Aviv-Yafo", "תל אביב-יפו", "IL-TA"],
  ["haifa", "Haifa", "חיפה", "IL-HA"], ["rishon-lezion", "Rishon LeZion", "ראשון לציון", "IL-M"],
  ["petah-tikva", "Petah Tikva", "פתח תקווה", "IL-M"], ["ashdod", "Ashdod", "אשדוד", "IL-S"],
  ["netanya", "Netanya", "נתניה", "IL-M"], ["beer-sheva", "Beer Sheva", "באר שבע", "IL-S"],
  ["holon", "Holon", "חולון", "IL-TA"], ["bnei-brak", "Bnei Brak", "בני ברק", "IL-TA"],
  ["ramat-gan", "Ramat Gan", "רמת גן", "IL-TA"], ["ashkelon", "Ashkelon", "אשקלון", "IL-S"],
  ["rehovot", "Rehovot", "רחובות", "IL-M"], ["bat-yam", "Bat Yam", "בת ים", "IL-TA"],
  ["herzliya", "Herzliya", "הרצליה", "IL-TA"], ["kfar-saba", "Kfar Saba", "כפר סבא", "IL-M"],
  ["hadera", "Hadera", "חדרה", "IL-HA"], ["modiin", "Modi'in-Maccabim-Re'ut", "מודיעין-מכבים-רעות", "IL-M"],
  ["nazareth", "Nazareth", "נצרת", "IL-N"], ["eilat", "Eilat", "אילת", "IL-S"],
  ["tiberias", "Tiberias", "טבריה", "IL-N"], ["afula", "Afula", "עפולה", "IL-N"],
  ["acre", "Acre", "עכו", "IL-N"], ["karmiel", "Karmiel", "כרמיאל", "IL-N"],
];

const SIMPLE: Record<string, Row[]> = {
  title: [["MR", "Mr", "מר"], ["MRS", "Mrs", "גב׳"], ["MS", "Ms", "גב׳"], ["DR", "Dr", "ד״ר"], ["PROF", "Prof", "פרופ׳"]],
  gender: [["MALE", "Male", "זכר"], ["FEMALE", "Female", "נקבה"], ["OTHER", "Other", "אחר"], ["NOT_SAID", "Prefer not to say", "מעדיף/ה שלא לציין"]],
  marital_status: [["SINGLE", "Single", "רווק/ה"], ["MARRIED", "Married", "נשוי/אה"], ["DIVORCED", "Divorced", "גרוש/ה"],
    ["WIDOWED", "Widowed", "אלמן/ה"], ["SEPARATED", "Separated", "פרוד/ה"], ["COMMON_LAW", "Common-law partner", "ידוע/ה בציבור"]],
  employment_status: [["EMPLOYED", "Employed", "שכיר/ה"], ["SELF_EMPLOYED", "Self-employed", "עצמאי/ת"], ["UNEMPLOYED", "Unemployed", "מובטל/ת"],
    ["RETIRED", "Retired", "פנסיונר/ית"], ["STUDENT", "Student", "סטודנט/ית"], ["HOMEMAKER", "Homemaker", "עקר/ת בית"]],
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
  loan_purpose: [["DEBT_CONSOLIDATION", "Debt consolidation", "איחוד הלוואות"], ["HOME_IMPROVEMENT", "Home improvement", "שיפוצים"],
    ["EDUCATION", "Education", "לימודים"], ["VEHICLE", "Vehicle", "רכב"], ["MEDICAL", "Medical", "רפואי"], ["WEDDING", "Wedding", "חתונה"],
    ["TRAVEL", "Travel", "נסיעות"], ["BUSINESS", "Business", "עסק"], ["OTHER", "Other", "אחר"]],
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
    `INSERT OR IGNORE INTO master_types (code, label_en, label_he, description, parent_type_code, attribute_defs, is_system, sort_order, created_at) ` +
    `VALUES (${q(t.code)}, ${q(t.en)}, ${q(t.he)}, ${t.desc ? q(t.desc) : "NULL"}, ${t.parent ? q(t.parent) : "NULL"}, ${q(JSON.stringify(t.attrs ?? []))}, 1, ${(i + 1) * 10}, ${q(now)});`,
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

for (const [type, rows] of Object.entries(SIMPLE)) items(type, rows);
items("country", [...ISO_COUNTRIES].sort((a, b) => a[1].localeCompare(b[1], "en")), undefined, true);
items("nationality", COUNTRIES.map(([c, , , en, he]) => [c, en, he] as Row));
items("state", DISTRICTS.map(([c, en, he]) => [c, en, he, { parent: "IL" }] as Row), "country");
items("city", CITIES.map(([c, en, he, d]) => [c, en, he, { parent: d }] as Row), "state");

console.log(out.join("\n"));
