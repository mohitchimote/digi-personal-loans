import { greeting, loanPurpose, type Lang } from "../app-format";
import { sectionLabel } from "../sections";
import type { loanApplications } from "../../db/schema";

// Customer-facing text for workflow NOTIFY / EMAIL effects. A definition names a template/event
// key; the wording lives here (it is localised and was previously inline in each handler).
// Moved verbatim from routes/applications.ts so the move is provably behaviour-preserving.

type App = typeof loanApplications.$inferSelect;
export type Vars = Record<string, unknown>;

export interface NotificationSpec { title: string; message: string; type: string }

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** A guarantor is newly needed only when the underwriter asked for one and none is on file. */
export function guarantorNewlyNeeded(vars: Vars): boolean {
  return vars.requireGuarantor === true && !vars.guarantorDetailsPresent;
}

function guarantorNote(vars: Vars, lang: Lang): string {
  if (!guarantorNewlyNeeded(vars)) return "";
  return lang === "he"
    ? " כעת נדרש ערב עבור בקשה זו — אנא מלא/י את פרק פרטי הערב החדש, כולל מסמך תומך עבור הערב, לפני ההגשה מחדש."
    : " A guarantor is now required for this application — please complete the new Guarantor Details section, " +
        "including a supporting document for your guarantor, before resubmitting.";
}

export function buildNotification(template: string, app: App, lang: Lang, vars: Vars): NotificationSpec | null {
  const he = lang === "he";
  switch (template) {
    case "DECISION_DECLINED": {
      const reason = str(vars.reason);
      return {
        title: he ? "עדכון לגבי בקשת ההלוואה שלך" : "Update on Your Loan Application",
        type: "APPLICATION_UPDATE",
        message: he
          ? `${greeting(app, lang)} תודה שהגשת בקשה להלוואה פרטית עבור ${loanPurpose(app, lang)} בדיגילנד. ` +
            "לאחר בדיקה מעמיקה, לא נוכל לאשר את בקשתך בשלב זה.\n\n" +
            `סיבה: ${reason}\n\n` +
            "השלבים הבאים: מוזמן/ת ליצור קשר עם יועץ דיגילנד שלך לפרטים נוספים, או להגיש בקשה חדשה בעתיד אם הנסיבות ישתנו."
          : `${greeting(app)} Thank you for applying for a personal loan for ${loanPurpose(app)} with DigiBank. ` +
            "After careful review, we are unable to approve your application at this time.\n\n" +
            `Reason: ${reason}\n\n` +
            "Next steps: You're welcome to contact your DigiBank advisor for more detail, or reapply in the future if your circumstances change.",
      };
    }
    case "SEND_BACK": {
      const reason = str(vars.reason);
      const note = guarantorNote(vars, lang);
      return {
        title: he ? "נדרשת פעולה בבקשת ההלוואה שלך" : "Action Needed on Your Loan Application",
        type: "APPLICATION_UPDATE",
        message: he
          ? `${greeting(app, lang)} תודה שהגשת בקשה להלוואה פרטית עבור ${loanPurpose(app, lang)} בדיגילנד. ` +
            "צוות החיתום שלנו בדק את בקשתך והחזיר אותה לצורך פרטים נוספים לפני שנוכל להמשיך.\n\n" +
            `הערת החתם: ${reason}\n\n` +
            "השלבים הבאים: אנא התחבר/י לפורטל דיגילנד, עיין/י במשוב על בקשתך, עדכן/י את הפרק/ים הרלוונטיים, " +
            "העלה/י מסמכים תומכים אם התבקש, והגש/י מחדש לבדיקה." +
            note
          : `${greeting(app)} Thank you for applying for a personal loan for ${loanPurpose(app)} with DigiBank. ` +
            "Our underwriting team has reviewed your application and sent it back for a few additional details before we can proceed.\n\n" +
            `Underwriter's note: ${reason}\n\n` +
            "Next steps: Please log in to your DigiBank portal, review the feedback on your application, update the relevant section(s), " +
            "upload any supporting documents if requested, and resubmit for review." +
            note,
      };
    }
    case "DECISION_APPROVED":
      return {
        title: he ? "בקשת ההלוואה שלך אושרה!" : "Your Loan Application Has Been Approved!",
        type: "APPROVAL",
        message: he
          ? `${greeting(app, lang)} מזל טוב! בקשתך להלוואה פרטית עבור ${loanPurpose(app, lang)} ` +
            "נבדקה ואושרה על ידי צוות החיתום שלנו.\n\n" +
            "השלבים הבאים: אנא התחבר/י לפורטל דיגילנד לצפייה במכתב האישור ובמסמכי הסכם ההלוואה בעמוד המסמכים."
          : `${greeting(app)} Congratulations! Your personal loan application for ${loanPurpose(app)} ` +
            "has been reviewed and approved by our underwriting team.\n\n" +
            "Next steps: Please log in to your DigiBank portal to view your approval letter and loan agreement documents in the Documents section.",
      };
    case "DISBURSEMENT_AUTHORISED":
      return {
        title: he ? "כספי ההלוואה שלך שוחררו" : "Your Loan Funds Have Been Released",
        type: "APPROVAL",
        message: he
          ? `${greeting(app, lang)} בשורה טובה — כספי ההלוואה שלך עבור ${loanPurpose(app, lang)} אושרו לשחרור ויועברו לחשבון שציינת בקרוב.`
          : `${greeting(app)} Great news — your loan funds for ${loanPurpose(app)} have been authorised for release and will be transferred to your nominated account shortly.`,
      };
    case "CLARIFICATION_REQUEST":
    case "DOCUMENT_REQUEST": {
      const isDoc = template === "DOCUMENT_REQUEST";
      const note = str(vars.text);
      const section = str(vars.section);
      return {
        title: he
          ? (isDoc ? "נדרש מסמך עבור בקשת ההלוואה שלך" : "נדרש הבהרה בנוגע לבקשת ההלוואה שלך")
          : (isDoc ? "Document Required for Your Loan Application" : "Clarification Needed on Your Loan Application"),
        type: "APPLICATION_UPDATE",
        message: he
          ? `${greeting(app, lang)} תודה שהגשת בקשה להלוואה פרטית עבור ${loanPurpose(app, lang)} בדיגילנד. ` +
            `צוות החיתום שלנו בודק את פרטי ${sectionLabel(section, lang)} שלך וזקוק ל` +
            `${isDoc ? "מסמך נוסף" : "הבהרה מסוימת"} לפני שנוכל להמשיך.\n\n` +
            `הערת החתם: ${note}\n\n` +
            `השלבים הבאים: ${
              isDoc
                ? "אנא התחבר/י לפורטל דיגילנד והעלה/י את המסמך הנדרש בעמוד המסמכים."
                : "אנא התחבר/י לפורטל דיגילנד, בדוק/י את הבקשה שלך, ועדכן/י את הפרק הרלוונטי."
            } לאחר מכן, הבקשה שלך תחזור לתור החיתום.`
          : `${greeting(app)} Thank you for applying for a personal loan for ${loanPurpose(app)} with DigiBank. ` +
            `Our underwriting team is reviewing your ${sectionLabel(section)} details and needs ` +
            `${isDoc ? "an additional document" : "some clarification"} before we can proceed.\n\n` +
            `Underwriter's note: ${note}\n\n` +
            `Next steps: ${
              isDoc
                ? "Please log in to your DigiBank portal and upload the requested document from the Documents section."
                : "Please log in to your DigiBank portal, review your application, and update the relevant section."
            } Once done, your application will be back in the underwriting queue.`,
      };
    }
    default:
      return null;
  }
}

/** Template variables for the admin-configured email (the same keys the handlers used to pass). */
export function buildEmailVars(event: string, vars: Vars, lang: Lang): Record<string, string> {
  switch (event) {
    case "DECISION_APPROVED":
      return { approvedAmount: vars.approvedAmount != null ? String(vars.approvedAmount) : "", reviewedBy: str(vars.reviewedBy) };
    case "DECISION_DECLINED":
      return { declineReason: str(vars.declineReason), reviewedBy: str(vars.reviewedBy) };
    case "SEND_BACK":
      return { sendBackReason: str(vars.sendBackReason), reviewedBy: str(vars.reviewedBy), guarantorRequiredNote: guarantorNote(vars, lang) };
    case "DISBURSEMENT_AUTHORISED":
      return { reviewedBy: str(vars.reviewedBy) };
    case "CLARIFICATION_REQUEST":
    case "DOCUMENT_REQUEST":
      return { underwriterNote: str(vars.underwriterNote), sectionName: sectionLabel(str(vars.section)) };
    default:
      return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, str(v)]));
  }
}
