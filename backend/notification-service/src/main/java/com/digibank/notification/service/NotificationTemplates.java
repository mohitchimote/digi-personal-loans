package com.digibank.notification.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The customer-facing notification and email wording, English and Hebrew, ported verbatim from the
 * Worker: worker/src/lib/workflow/messages.ts (buildNotification, buildEmailVars),
 * worker/src/lib/app-format.ts (greeting, loanPurpose) and worker/src/lib/sections.ts (sectionLabel).
 * The language is the customer's stored preference (users.preferred_language, owned by auth-service);
 * the caller supplies it, this class only picks the text. Parity tests read the Worker sources.
 */
public final class NotificationTemplates {

    private NotificationTemplates() {}

    public record Spec(String title, String message, String type) {}

    public static String normaliseLang(String lang) {
        return "he".equals(lang) ? "he" : "en";
    }

    /** The Worker's WELCOME_MESSAGES, in order. */
    public static List<Spec> welcome(String lang) {
        if ("he".equals(normaliseLang(lang))) {
            return List.of(
                new Spec("ברוכים הבאים להלוואות פרטיות מדיגילנד",
                    "תודה שבחרת בדיגילנד. אנחנו כאן כדי לעזור לך למצוא את ההלוואה הפרטית המתאימה לצרכים שלך. תהליך הבקשה שלנו מהיר, שקוף ודיגיטלי לחלוטין.",
                    "SUCCESS"),
                new Spec("המסמכים שתצטרך/י",
                    "כדי להשלים את הבקשה תזדקק/י ל: תלושי שכר אחרונים (3 חודשים אחרונים), דפי חשבון בנק (6 חודשים אחרונים), תעודה מזהה בתוקף, ואישור כתובת מהשלושה חודשים האחרונים.",
                    "INFO"),
                new Spec("הבקשה שלך נשמרת אוטומטית",
                    "אל דאגה מאובדן התקדמות — הבקשה שלך נשמרת אוטומטית לאחר כל פרק. ניתן לחזור בכל עת ולהמשיך מהמקום שבו הפסקת.",
                    "INFO"));
        }
        return List.of(
            new Spec("Welcome to DigiBank Personal Loans",
                "Thank you for choosing DigiBank. We're here to help you find the right personal loan for your needs. Our application process is quick, transparent, and entirely digital.",
                "SUCCESS"),
            new Spec("Documents You'll Need",
                "To complete your application you will need: recent payslips (last 3 months), bank statements (last 6 months), a valid ID document, and proof of address dated within 3 months.",
                "INFO"),
            new Spec("Your Application is Auto-Saved",
                "Don't worry about losing progress — your application is automatically saved after each section. You can return at any time to complete it from where you left off.",
                "INFO"));
    }

    private static final Map<String, String> LOAN_PURPOSE_HE = new LinkedHashMap<>();
    static {
        LOAN_PURPOSE_HE.put("Home Improvement", "שיפוץ דירה");
        LOAN_PURPOSE_HE.put("Debt Consolidation", "איחוד הלוואות");
        LOAN_PURPOSE_HE.put("Vehicle Purchase", "רכישת רכב");
        LOAN_PURPOSE_HE.put("Education", "לימודים");
        LOAN_PURPOSE_HE.put("Medical Expenses", "הוצאות רפואיות");
        LOAN_PURPOSE_HE.put("Wedding", "חתונה");
        LOAN_PURPOSE_HE.put("Travel", "נסיעה");
        LOAN_PURPOSE_HE.put("Business", "עסק");
        LOAN_PURPOSE_HE.put("Working Capital", "הון חוזר");
        LOAN_PURPOSE_HE.put("Equipment Purchase", "רכישת ציוד");
        LOAN_PURPOSE_HE.put("Business Expansion", "הרחבת העסק");
        LOAN_PURPOSE_HE.put("Inventory Financing", "מימון מלאי");
        LOAN_PURPOSE_HE.put("Debt Refinancing", "מיחזור חוב");
        LOAN_PURPOSE_HE.put("Commercial Property", "נכס מסחרי");
        LOAN_PURPOSE_HE.put("Other", "אחר");
    }

    /** applicantFirstName(): the bare first name, or "Customer" when there is none. */
    public static String firstNameOrDefault(String firstName) {
        return firstName != null && !firstName.isBlank() ? firstName : "Customer";
    }

    public static String greeting(String firstName, String lang) {
        String name = firstNameOrDefault(firstName);
        return "he".equals(normaliseLang(lang))
                ? "שלום " + ("Customer".equals(name) ? "רבים" : name) + ","
                : "Dear " + name + ",";
    }

    /** loanPurpose(): rawPurpose is the trimmed purpose from loan requirements, else the company details. */
    public static String loanPurpose(String rawPurpose, String lang) {
        String value = rawPurpose != null && !rawPurpose.isBlank() ? rawPurpose.trim() : null;
        boolean he = "he".equals(normaliseLang(lang));
        if (value == null) return he ? "המטרה שביקשת" : "your requested purpose";
        return he ? LOAN_PURPOSE_HE.getOrDefault(value, value) : value;
    }

    public static String sectionLabel(String section, String lang) {
        boolean he = "he".equals(normaliseLang(lang));
        String s = section == null ? "" : section;
        return switch (s) {
            case "loanRequirements" -> he ? "פרטי ההלוואה" : "Loan Requirements";
            case "consentManagement" -> he ? "ניהול הסכמות" : "Consent Management";
            case "personalDetails" -> he ? "פרטים אישיים" : "Personal Details";
            case "connectBank" -> he ? "חיבור לבנק" : "Bank Connection";
            case "incomeEmployment" -> he ? "הכנסה ותעסוקה" : "Income & Employment";
            case "outgoings" -> he ? "הוצאות" : "Outgoings & Expenditure";
            case "creditDeclarations" -> he ? "הצהרות אשראי" : "Credit Declarations";
            case "verifyId" -> he ? "אימות זהות" : "ID Verification";
            case "directDebit" -> he ? "פרטי הוראת קבע" : "Direct Debit Details";
            case "guarantorDetails" -> he ? "פרטי ערב" : "Guarantor Details";
            default -> he ? "הבקשה" : "application";
        };
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    /** A guarantor is newly needed only when the underwriter asked for one and none is on file. */
    public static boolean guarantorNewlyNeeded(Map<String, Object> vars) {
        return Boolean.TRUE.equals(vars.get("requireGuarantor")) && !truthy(vars.get("guarantorDetailsPresent"));
    }

    private static boolean truthy(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.doubleValue() != 0;
        return !String.valueOf(v).isEmpty();
    }

    public static String guarantorNote(Map<String, Object> vars, String lang) {
        if (!guarantorNewlyNeeded(vars)) return "";
        return "he".equals(normaliseLang(lang))
                ? " כעת נדרש ערב עבור בקשה זו — אנא מלא/י את פרק פרטי הערב החדש, כולל מסמך תומך עבור הערב, לפני ההגשה מחדש."
                : " A guarantor is now required for this application — please complete the new Guarantor Details section, "
                    + "including a supporting document for your guarantor, before resubmitting.";
    }

    /** Null for an unknown template, as in the Worker. */
    public static Spec buildNotification(String template, String firstName, String rawPurpose, String lang, Map<String, Object> vars) {
        String l = normaliseLang(lang);
        boolean he = "he".equals(l);
        String greetL = greeting(firstName, l);
        String greetEn = greeting(firstName, "en");
        String purposeL = loanPurpose(rawPurpose, l);
        String purposeEn = loanPurpose(rawPurpose, "en");
        if (template == null) return null;
        switch (template) {
            case "DECISION_DECLINED": {
                String reason = str(vars.get("reason"));
                return new Spec(
                    he ? "עדכון לגבי בקשת ההלוואה שלך" : "Update on Your Loan Application",
                    he
                        ? greetL + " תודה שהגשת בקשה להלוואה פרטית עבור " + purposeL + " בדיגילנד. "
                            + "לאחר בדיקה מעמיקה, לא נוכל לאשר את בקשתך בשלב זה.\n\n"
                            + "סיבה: " + reason + "\n\n"
                            + "השלבים הבאים: מוזמן/ת ליצור קשר עם יועץ דיגילנד שלך לפרטים נוספים, או להגיש בקשה חדשה בעתיד אם הנסיבות ישתנו."
                        : greetEn + " Thank you for applying for a personal loan for " + purposeEn + " with DigiBank. "
                            + "After careful review, we are unable to approve your application at this time.\n\n"
                            + "Reason: " + reason + "\n\n"
                            + "Next steps: You're welcome to contact your DigiBank advisor for more detail, or reapply in the future if your circumstances change.",
                    "APPLICATION_UPDATE");
            }
            case "SEND_BACK": {
                String reason = str(vars.get("reason"));
                String note = guarantorNote(vars, l);
                return new Spec(
                    he ? "נדרשת פעולה בבקשת ההלוואה שלך" : "Action Needed on Your Loan Application",
                    he
                        ? greetL + " תודה שהגשת בקשה להלוואה פרטית עבור " + purposeL + " בדיגילנד. "
                            + "צוות החיתום שלנו בדק את בקשתך והחזיר אותה לצורך פרטים נוספים לפני שנוכל להמשיך.\n\n"
                            + "הערת החתם: " + reason + "\n\n"
                            + "השלבים הבאים: אנא התחבר/י לפורטל דיגילנד, עיין/י במשוב על בקשתך, עדכן/י את הפרק/ים הרלוונטיים, "
                            + "העלה/י מסמכים תומכים אם התבקש, והגש/י מחדש לבדיקה."
                            + note
                        : greetEn + " Thank you for applying for a personal loan for " + purposeEn + " with DigiBank. "
                            + "Our underwriting team has reviewed your application and sent it back for a few additional details before we can proceed.\n\n"
                            + "Underwriter's note: " + reason + "\n\n"
                            + "Next steps: Please log in to your DigiBank portal, review the feedback on your application, update the relevant section(s), "
                            + "upload any supporting documents if requested, and resubmit for review."
                            + note,
                    "APPLICATION_UPDATE");
            }
            case "DECISION_APPROVED":
                return new Spec(
                    he ? "בקשת ההלוואה שלך אושרה!" : "Your Loan Application Has Been Approved!",
                    he
                        ? greetL + " מזל טוב! בקשתך להלוואה פרטית עבור " + purposeL + " "
                            + "נבדקה ואושרה על ידי צוות החיתום שלנו.\n\n"
                            + "השלבים הבאים: אנא התחבר/י לפורטל דיגילנד לצפייה במכתב האישור ובמסמכי הסכם ההלוואה בעמוד המסמכים."
                        : greetEn + " Congratulations! Your personal loan application for " + purposeEn + " "
                            + "has been reviewed and approved by our underwriting team.\n\n"
                            + "Next steps: Please log in to your DigiBank portal to view your approval letter and loan agreement documents in the Documents section.",
                    "APPROVAL");
            case "DISBURSEMENT_AUTHORISED":
                return new Spec(
                    he ? "כספי ההלוואה שלך שוחררו" : "Your Loan Funds Have Been Released",
                    he
                        ? greetL + " בשורה טובה — כספי ההלוואה שלך עבור " + purposeL + " אושרו לשחרור ויועברו לחשבון שציינת בקרוב."
                        : greetEn + " Great news — your loan funds for " + purposeEn + " have been authorised for release and will be transferred to your nominated account shortly.",
                    "APPROVAL");
            case "CLARIFICATION_REQUEST":
            case "DOCUMENT_REQUEST": {
                boolean isDoc = "DOCUMENT_REQUEST".equals(template);
                String note = str(vars.get("text"));
                String section = str(vars.get("section"));
                String title = he
                        ? (isDoc ? "נדרש מסמך עבור בקשת ההלוואה שלך" : "נדרש הבהרה בנוגע לבקשת ההלוואה שלך")
                        : (isDoc ? "Document Required for Your Loan Application" : "Clarification Needed on Your Loan Application");
                String message = he
                        ? greetL + " תודה שהגשת בקשה להלוואה פרטית עבור " + purposeL + " בדיגילנד. "
                            + "צוות החיתום שלנו בודק את פרטי " + sectionLabel(section, l) + " שלך וזקוק ל"
                            + (isDoc ? "מסמך נוסף" : "הבהרה מסוימת") + " לפני שנוכל להמשיך.\n\n"
                            + "הערת החתם: " + note + "\n\n"
                            + "השלבים הבאים: "
                            + (isDoc
                                ? "אנא התחבר/י לפורטל דיגילנד והעלה/י את המסמך הנדרש בעמוד המסמכים."
                                : "אנא התחבר/י לפורטל דיגילנד, בדוק/י את הבקשה שלך, ועדכן/י את הפרק הרלוונטי.")
                            + " לאחר מכן, הבקשה שלך תחזור לתור החיתום."
                        : greetEn + " Thank you for applying for a personal loan for " + purposeEn + " with DigiBank. "
                            + "Our underwriting team is reviewing your " + sectionLabel(section, "en") + " details and needs "
                            + (isDoc ? "an additional document" : "some clarification") + " before we can proceed.\n\n"
                            + "Underwriter's note: " + note + "\n\n"
                            + "Next steps: "
                            + (isDoc
                                ? "Please log in to your DigiBank portal and upload the requested document from the Documents section."
                                : "Please log in to your DigiBank portal, review your application, and update the relevant section.")
                            + " Once done, your application will be back in the underwriting queue.";
                return new Spec(title, message, "APPLICATION_UPDATE");
            }
            default:
                return null;
        }
    }

    /** Template variables for the admin-configured email, as the Worker's buildEmailVars. */
    public static Map<String, String> buildEmailVars(String event, Map<String, Object> vars, String lang) {
        Map<String, String> out = new LinkedHashMap<>();
        switch (event == null ? "" : event) {
            case "DECISION_APPROVED" -> {
                out.put("approvedAmount", vars.get("approvedAmount") != null ? String.valueOf(vars.get("approvedAmount")) : "");
                out.put("reviewedBy", str(vars.get("reviewedBy")));
            }
            case "DECISION_DECLINED" -> {
                out.put("declineReason", str(vars.get("declineReason")));
                out.put("reviewedBy", str(vars.get("reviewedBy")));
            }
            case "SEND_BACK" -> {
                out.put("sendBackReason", str(vars.get("sendBackReason")));
                out.put("reviewedBy", str(vars.get("reviewedBy")));
                out.put("guarantorRequiredNote", guarantorNote(vars, lang));
            }
            case "DISBURSEMENT_AUTHORISED" -> out.put("reviewedBy", str(vars.get("reviewedBy")));
            case "CLARIFICATION_REQUEST", "DOCUMENT_REQUEST" -> {
                out.put("underwriterNote", str(vars.get("underwriterNote")));
                out.put("sectionName", sectionLabel(str(vars.get("section")), "en"));
            }
            default -> vars.forEach((k, v) -> out.put(k, str(v)));
        }
        return out;
    }
}
