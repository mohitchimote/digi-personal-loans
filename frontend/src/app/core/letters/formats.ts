// COPY of worker/src/lib/letters/formats.ts: the frontend and Worker deploy separately and share no package.
// Keep in step; both run letter-spec/vectors. Used only to show sample values in the editor.
import type { Choice, FieldMeta, Lang } from "../services/letters.service";

// Number, date and wording formats for letters. Written out by hand (not Intl) so the Java engine can
// reproduce them exactly: see letter-spec/README.md "Formats" and letter-spec/vectors/formats.json.

const MONTHS: Record<Lang, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  he: ["בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני", "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר"],
};

/** "1234567" -> "1,234,567". */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** n rounded half up to `dp` decimals, with comma grouping and a leading "-" for negatives. */
export function fixed(n: number, dp: number): string {
  const neg = n < 0 && Number(Math.abs(n).toFixed(dp)) !== 0;
  const [i, f] = Math.abs(n).toFixed(dp).split(".");
  return (neg ? "-" : "") + group(i) + (f ? "." + f : "");
}

function moneyText(n: number, dp: number, lang: Lang): string {
  const body = fixed(Math.abs(n), dp), neg = n < 0 && Number(Math.abs(n).toFixed(dp)) !== 0;
  return lang === "he" ? (neg ? "-" : "") + body + " ₪" : (neg ? "-" : "") + "₪" + body;
}

/** Percent with at least one and at most two decimals: 5.4 -> "5.4%", 5.25 -> "5.25%", 6 -> "6.0%". */
function percentText(n: number): string {
  const two = Math.abs(n).toFixed(2), trimmed = two.endsWith("0") ? two.slice(0, -1) : two;
  const [i, f] = trimmed.split(".");
  return (n < 0 && Number(two) !== 0 ? "-" : "") + group(i) + "." + f + "%";
}

export function formatTerm(months: number, lang: Lang): string {
  const y = Math.floor(months / 12), m = months % 12;
  const parts: string[] = [];
  if (lang === "he") {
    if (y) parts.push(y === 1 ? "שנה" : y === 2 ? "שנתיים" : `${y} שנים`);
    if (m) parts.push(m === 1 ? "חודש" : m === 2 ? "חודשיים" : `${m} חודשים`);
    // The "and" is the prefix ו: attached to a word, hyphenated before a numeral ("שנה וחודשיים", "3 שנים ו-6 חודשים").
    return parts.length === 2 ? parts[0] + (/^\d/.test(parts[1]) ? " ו-" : " ו") + parts[1] : parts.join("");
  }
  if (y) parts.push(`${y} ${y === 1 ? "year" : "years"}`);
  if (m) parts.push(`${m} ${m === 1 ? "month" : "months"}`);
  return parts.join(" and ");
}

/** "2026-11-13" -> "13 November 2026" / "13 בנובמבר 2026". */
export function formatDate(iso: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[lang][Number(m[2]) - 1]} ${m[1]}`;
}

const DEFAULT_FMT: Record<string, string> = { number: "int", money: "money", percent: "pct", date: "date", bool: "yesno" };
export const FORMATS = ["int", "dec", "money", "money2", "pct", "term", "date", "yesno"] as const;

export function choiceLabel(choices: Choice[] | undefined, v: unknown, lang: Lang): string {
  const c = (choices ?? []).find((x) => x.v === String(v));
  return c ? c[lang] || c.en : String(v);
}

/** The text a value prints as. Returns "" for a missing value. `fmt` overrides the field's default. */
export function formatValue(value: unknown, meta: Pick<FieldMeta, "type" | "fmt" | "choices"> | undefined, fmt: string | undefined, lang: Lang): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "object" && value !== null && "en" in (value as object)) { const b = value as { en: string; he?: string }; return (lang === "he" ? b.he : b.en) || b.en; }
  const type = meta?.type;
  if (type === "choice") return choiceLabel(meta?.choices, value, lang);
  const f = fmt ?? meta?.fmt ?? (type ? DEFAULT_FMT[type] : undefined);
  if (typeof value === "boolean") return lang === "he" ? (value ? "כן" : "לא") : value ? "Yes" : "No";
  if (typeof value === "number") {
    switch (f) {
      case "dec": return fixed(value, 2);
      case "money": return moneyText(value, 0, lang);
      case "money2": return moneyText(value, 2, lang);
      case "pct": return percentText(value);
      case "term": return formatTerm(value, lang);
      default: return fixed(value, 0);
    }
  }
  if (type === "date" || f === "date") return formatDate(String(value), lang);
  return String(value);
}
