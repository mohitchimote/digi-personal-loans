package com.digibank.document.generation;

import com.digibank.document.generation.dto.DocumentGenerationRequest;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.kernel.events.Event;
import com.itextpdf.kernel.events.IEventHandler;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Canvas;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.*;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/**
 * The full offer pack a personal-loan decision hands a customer: the cover/approval letter (this
 * service's original document), plus a Key Facts Statement, Repayment Schedule, and Terms &
 * Conditions — ported from worker/src/lib/pdf/*.ts (generation.GenerationService.generateOfferPack
 * orchestrates all four, mirroring worker/src/lib/document-pack.ts). Every document but the
 * original approval letter is a demo-shaped placeholder pending real Israeli Legal & Compliance
 * content — see ILLUSTRATIVE_NOTICE below, carried over from the Worker verbatim.
 */
@Service
public class PdfGeneratorService {

    private static final DeviceRgb TCS_BLUE   = new DeviceRgb(0, 51, 102);
    private static final DeviceRgb TCS_YELLOW = new DeviceRgb(251, 176, 52);
    private static final DeviceRgb LIGHT_GREY = new DeviceRgb(245, 245, 245);
    private static final DeviceRgb GREY       = new DeviceRgb(120, 120, 120);

    // Every offer-pack document not yet backed by real Legal/Compliance-approved wording carries
    // this note (worker/src/lib/pdf/pdf-common.ts's ILLUSTRATIVE_NOTICE, verbatim) — illustrative
    // placeholders standing in for a proper ESIS/SECCI-equivalent artefact, not reviewed Israeli
    // consumer-credit disclosure text.
    private static final String ILLUSTRATIVE_NOTICE =
            "This document is an illustrative placeholder for demonstration purposes. Final wording is subject " +
            "to review and approval by DigiLend Legal & Compliance before use with real customers.";

    public byte[] generateApprovalLetter(DocumentGenerationRequest req) {
        return generateLetter(req, false);
    }

    public byte[] generateFinalApprovalLetter(DocumentGenerationRequest req) {
        return generateLetter(req, true);
    }

    private byte[] generateLetter(DocumentGenerationRequest req, boolean isFinal) {
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdf  = new PdfDocument(writer);
            Document doc     = new Document(pdf, PageSize.A4);
            doc.setMargins(50, 50, 50, 50);

            PdfFont bold    = PdfFontFactory.createFont("Helvetica-Bold");
            PdfFont regular = PdfFontFactory.createFont("Helvetica");

            NumberFormat nf = NumberFormat.getNumberInstance(Locale.US);

            // Header bar
            Table header = new Table(UnitValue.createPercentArray(new float[]{60, 40})).useAllAvailableWidth();
            Cell brandCell = new Cell().add(new Paragraph("DigiBank").setFont(bold).setFontSize(22).setFontColor(TCS_BLUE))
                    .add(new Paragraph("Personal Banking").setFont(regular).setFontSize(9).setFontColor(TCS_BLUE))
                    .setBorder(com.itextpdf.layout.borders.Border.NO_BORDER).setPaddingBottom(4);
            Cell refCell = new Cell().add(new Paragraph("Application Reference").setFont(regular).setFontSize(8).setFontColor(TCS_BLUE))
                    .add(new Paragraph(req.getApplicationRef()).setFont(bold).setFontSize(10).setFontColor(TCS_BLUE))
                    .add(new Paragraph(LocalDate.now().format(DateTimeFormatter.ofPattern("dd MMMM yyyy"))).setFont(regular).setFontSize(8))
                    .setBorder(com.itextpdf.layout.borders.Border.NO_BORDER)
                    .setTextAlignment(TextAlignment.RIGHT);
            header.addCell(brandCell).addCell(refCell);
            doc.add(header);

            // Yellow divider
            doc.add(new Table(1).useAllAvailableWidth()
                    .addCell(new Cell().setHeight(4).setBackgroundColor(TCS_YELLOW).setBorder(com.itextpdf.layout.borders.Border.NO_BORDER)));
            doc.add(new Paragraph("\n"));

            // Title
            doc.add(new Paragraph(isFinal ? "FINAL APPROVAL LETTER" : "CONDITIONAL APPROVAL LETTER").setFont(bold).setFontSize(16)
                    .setFontColor(TCS_BLUE).setTextAlignment(TextAlignment.CENTER).setMarginBottom(4));
            doc.add(new Paragraph("Personal Loan").setFont(regular).setFontSize(11)
                    .setTextAlignment(TextAlignment.CENTER).setMarginBottom(20));

            // Addressee
            doc.add(new Paragraph("Dear " + req.getCustomerName() + ",").setFont(regular).setFontSize(11).setMarginBottom(10));
            doc.add(new Paragraph(isFinal
                    ? "We are pleased to confirm that your application for a personal loan with DigiBank has been " +
                      "fully reviewed and approved by our underwriting team. All verification checks have been " +
                      "satisfactorily completed. Please review the final details of your offer below."
                    : "We are pleased to confirm that your application for a personal loan with DigiBank has been " +
                      "conditionally approved, subject to satisfactory verification of the information and documents " +
                      "provided. Please review the details of your conditional offer below.")
                    .setFont(regular).setFontSize(10).setMarginBottom(20));

            // Loan details table
            doc.add(new Paragraph("Loan Details").setFont(bold).setFontSize(12).setFontColor(TCS_BLUE).setMarginBottom(8));
            Table details = new Table(UnitValue.createPercentArray(new float[]{45, 55})).useAllAvailableWidth()
                    .setMarginBottom(20);

            addRow(details, "Product",             req.getProductName(),                                        bold, regular, true);
            addRow(details, "Loan Amount",         "₪" + nf.format(req.getLoanAmount()),                       bold, regular, false);
            addRow(details, "Interest Rate",       req.getInterestRate() + "% APR",                            bold, regular, true);
            addRow(details, "Loan Term",           req.getTermMonths() + " months",                            bold, regular, false);
            addRow(details, "Monthly Repayment",   "₪" + nf.format(req.getMonthlyRepayment()),                 bold, regular, true);
            addRow(details, "Total Repayable",     "₪" + nf.format(req.getMonthlyRepayment() * req.getTermMonths()), bold, regular, false);
            doc.add(details);

            // Conditions
            doc.add(new Paragraph(isFinal ? "Verification Completed" : "Conditions of Approval").setFont(bold).setFontSize(12).setFontColor(TCS_BLUE).setMarginBottom(8));
            String[] conditions = isFinal
                ? new String[] {
                    "Identity verification (Teudat Zehut) completed.",
                    "Income documentation reviewed and confirmed.",
                    "Bank statements reviewed and confirmed.",
                    "No material change in financial circumstances identified.",
                    "Application approved for execution of the formal Loan Agreement."
                }
                : new String[] {
                    "Satisfactory verification of identity (Teudat Zehut).",
                    "Receipt and verification of income documentation (payslips or Shuma).",
                    "Receipt of three months' bank statements confirming income and outgoings.",
                    "No material change in financial circumstances since the date of application.",
                    "Execution of the formal Loan Agreement in the form provided by DigiBank."
                };
            for (int i = 0; i < conditions.length; i++) {
                doc.add(new Paragraph((i + 1) + ".  " + conditions[i]).setFont(regular).setFontSize(9).setMarginBottom(4));
            }
            doc.add(new Paragraph("\n"));

            // Next steps
            doc.add(new Paragraph("Next Steps").setFont(bold).setFontSize(12).setFontColor(TCS_BLUE).setMarginBottom(8));
            doc.add(new Paragraph(isFinal
                    ? "Your DigiBank advisor will be in touch shortly to arrange execution of the Loan Agreement and " +
                      "drawdown of funds to your nominated account."
                    : "Please log in to your DigiBank portal and upload the required supporting documents in the Documents section. " +
                      "Once all documents have been received and verified, your assigned advisor will contact you to arrange " +
                      "execution of the Loan Agreement and drawdown of funds.")
                    .setFont(regular).setFontSize(10).setMarginBottom(20));

            // Footer disclaimer
            doc.add(new Table(1).useAllAvailableWidth()
                    .addCell(new Cell().setHeight(2).setBackgroundColor(TCS_YELLOW).setBorder(com.itextpdf.layout.borders.Border.NO_BORDER)));
            doc.add(new Paragraph(
                    "This is a conditional approval only. DigiBank reserves the right to withdraw or amend this offer " +
                    "prior to drawdown. This letter does not constitute a binding commitment to lend. " +
                    "DigiBank Ltd is regulated under Israeli Banking Law 5761-2000. Registered in Israel No. 51-234567-8.")
                    .setFont(regular).setFontSize(7).setFontColor(new DeviceRgb(120, 120, 120)).setMarginTop(10));

            doc.close();
            return baos.toByteArray();

        } catch (Exception e) {
            throw new RuntimeException("Failed to generate PDF", e);
        }
    }

    private void addRow(Table table, String label, String value, PdfFont bold, PdfFont regular, boolean shaded) {
        DeviceRgb bg = shaded ? LIGHT_GREY : new DeviceRgb(255, 255, 255);
        table.addCell(new Cell().add(new Paragraph(label).setFont(bold).setFontSize(9))
                .setBackgroundColor(bg).setBorder(new SolidBorder(new DeviceRgb(220, 220, 220), 0.5f)).setPadding(6));
        table.addCell(new Cell().add(new Paragraph(value).setFont(regular).setFontSize(9))
                .setBackgroundColor(bg).setBorder(new SolidBorder(new DeviceRgb(220, 220, 220), 0.5f)).setPadding(6));
    }

    // ------------------------------------------------------------------------------------------
    // Offer-pack documents — Key Facts Statement, Repayment Schedule, Terms & Conditions.
    // Ports worker/src/lib/pdf/key-facts-statement.ts, repayment-schedule.ts,
    // terms-and-conditions.ts. All three use a repeating letterhead (LetterheadHandler below),
    // matching pdf-common.ts's newPage()-on-every-page behavior for multi-page documents.
    // ------------------------------------------------------------------------------------------

    /** Illustrative equivalent of the UK's SECCI/ESIS pre-contract disclosure sheet — the
     * standardised, plain-language summary of a credit offer's key terms. Israel's own equivalent
     * sits in the Bank of Israel's Proper Conduct of Banking Business directives and the Fair
     * Credit Law; this generator produces a demo-shaped stand-in, not reviewed legal text. */
    public byte[] generateKeyFactsStatement(DocumentGenerationRequest req, boolean isFinal) {
        String title = isFinal ? "LOAN KEY FACTS STATEMENT — FINAL" : "LOAN KEY FACTS STATEMENT";
        return withLetterheadDocument(req.getApplicationRef(), title, (doc, fonts) -> {
            NumberFormat nf = NumberFormat.getNumberInstance(Locale.US);
            double totalRepayable = req.getMonthlyRepayment() * req.getTermMonths();
            double totalCostOfCredit = totalRepayable - req.getLoanAmount();

            addParagraph(doc, fonts,
                    "This statement sets out the key terms of your loan in a standard format, so you can compare " +
                    "it with offers from other lenders before you decide. It does not itself create any binding " +
                    "obligation to lend or borrow.");

            addSectionHeading(doc, fonts, "1. Lender");
            addKeyValueRow(doc, fonts, "Lender", "DigiBank Ltd, regulated under Israeli Banking Law 5761-2000");
            addKeyValueRow(doc, fonts, "Registered No.", "51-234567-8");
            addKeyValueRow(doc, fonts, "Borrower", req.getCustomerName());

            addSectionHeading(doc, fonts, "2. Main Features of the Credit Product");
            addKeyValueRow(doc, fonts, "Type of credit", "Personal loan, fixed instalments");
            addKeyValueRow(doc, fonts, "Product", req.getProductName());
            addKeyValueRow(doc, fonts, "Total amount of credit", "₪" + nf.format(req.getLoanAmount()));
            addKeyValueRow(doc, fonts, "Duration of agreement", req.getTermMonths() + " months");
            addKeyValueRow(doc, fonts, "Instalments", req.getTermMonths() + " monthly instalments of ₪"
                    + nf.format(req.getMonthlyRepayment()) + ", due the same calendar day each month");
            addKeyValueRow(doc, fonts, "Total amount payable", "₪" + nf.format(totalRepayable));

            addSectionHeading(doc, fonts, "3. Cost of the Credit");
            addKeyValueRow(doc, fonts, "Interest rate", req.getInterestRate() + "% APR, fixed for the full term");
            addKeyValueRow(doc, fonts, "Total cost of credit", "₪" + nf.format(totalCostOfCredit));
            addParagraph(doc, fonts, "Representative example: borrowing ₪" + nf.format(req.getLoanAmount())
                    + " over " + req.getTermMonths() + " months at " + req.getInterestRate() + "% APR (fixed) means "
                    + req.getTermMonths() + " monthly repayments of ₪" + nf.format(req.getMonthlyRepayment())
                    + ", total repayable ₪" + nf.format(totalRepayable) + ".");

            addSectionHeading(doc, fonts, "4. Right of Withdrawal");
            addParagraph(doc, fonts,
                    "You have the right to withdraw from this credit agreement without giving any reason within 14 " +
                    "calendar days of the agreement being executed. To exercise this right, contact your DigiBank " +
                    "advisor before the withdrawal period ends. If you withdraw, you must repay the capital drawn " +
                    "down without undue delay, together with interest accrued up to the date of repayment.");

            addSectionHeading(doc, fonts, "5. Early Repayment");
            addParagraph(doc, fonts,
                    "You are entitled to repay this loan early, in full or in part, at any time. On early " +
                    "repayment, you are entitled to a reduction in the total cost of credit, consisting of the " +
                    "interest for the remaining term of the agreement. No early repayment charge applies.");

            addSectionHeading(doc, fonts, "6. Consequences of Missing Payments");
            addParagraph(doc, fonts,
                    "Missing a payment may have severe consequences (e.g. forced sale of assets securing the loan, " +
                    "where applicable) and make obtaining credit more difficult. DigiBank will apply the default " +
                    "interest rate set out in your loan agreement to overdue amounts and may report late or missed " +
                    "payments to credit reference agencies.");

            addFooterDisclaimer(doc, fonts);
        });
    }

    /** Standard reducing-balance amortisation schedule — ports repayment-schedule.ts's
     * buildSchedule() exactly: each instalment's interest portion is the outstanding balance times
     * the monthly rate, the remainder pays down principal, and the final row is clamped to zero
     * rather than trusting the fixed instalment amount (rounding across termMonths periods
     * otherwise drifts the closing balance a few agorot off zero). */
    public byte[] generateRepaymentSchedule(DocumentGenerationRequest req) {
        return withLetterheadDocument(req.getApplicationRef(), "REPAYMENT SCHEDULE", (doc, fonts) -> {
            NumberFormat nf = NumberFormat.getNumberInstance(Locale.US);
            double totalRepayable = req.getMonthlyRepayment() * req.getTermMonths();

            addParagraph(doc, fonts, "Illustrative month-by-month repayment schedule for " + req.getCustomerName()
                    + "'s loan of ₪" + nf.format(req.getLoanAmount()) + " over " + req.getTermMonths()
                    + " months at " + req.getInterestRate() + "% APR (fixed), totalling ₪" + nf.format(totalRepayable)
                    + " repayable. Actual due dates will be confirmed in your loan agreement and may shift slightly "
                    + "to align with your chosen payment date each month.");

            Table table = new Table(UnitValue.createPercentArray(new float[]{8, 20, 18, 18, 18, 18})).useAllAvailableWidth();
            addScheduleHeaderCell(table, "#", fonts.bold);
            addScheduleHeaderCell(table, "Due Date", fonts.bold);
            addScheduleHeaderCell(table, "Payment", fonts.bold);
            addScheduleHeaderCell(table, "Principal", fonts.bold);
            addScheduleHeaderCell(table, "Interest", fonts.bold);
            addScheduleHeaderCell(table, "Balance", fonts.bold);
            table.setSkipFirstHeader(false);

            double monthlyRate = req.getInterestRate() / 100.0 / 12.0;
            double balance = req.getLoanAmount();
            LocalDate today = LocalDate.now();
            DateTimeFormatter dateFmt = DateTimeFormatter.ofPattern("dd MMM yyyy");

            for (int i = 1; i <= req.getTermMonths(); i++) {
                double interest = balance * monthlyRate;
                double principal = req.getMonthlyRepayment() - interest;
                double payment = req.getMonthlyRepayment();
                if (i == req.getTermMonths() || principal > balance) {
                    principal = balance;
                    payment = principal + interest;
                }
                balance = Math.max(0, balance - principal);
                LocalDate dueDate = today.plusMonths(i);

                addScheduleCell(table, String.valueOf(i), fonts.regular);
                addScheduleCell(table, dueDate.format(dateFmt), fonts.regular);
                addScheduleCell(table, "₪" + nf.format(payment), fonts.regular);
                addScheduleCell(table, "₪" + nf.format(principal), fonts.regular);
                addScheduleCell(table, "₪" + nf.format(interest), fonts.regular);
                addScheduleCell(table, "₪" + nf.format(balance), fonts.regular);
            }
            doc.add(table);

            addFooterDisclaimer(doc, fonts);
        });
    }

    /** Generic personal-loan T&Cs shell — ports terms-and-conditions.ts's SECTIONS verbatim (same
     * structure/coverage a UK consumer-credit T&Cs document would have, adapted to reference
     * Israeli law). Illustrative placeholder wording only. */
    public byte[] generateTermsAndConditions(DocumentGenerationRequest req) {
        return withLetterheadDocument(req.getApplicationRef(), "PERSONAL LOAN — TERMS AND CONDITIONS", (doc, fonts) -> {
            addParagraph(doc, fonts, "These Terms and Conditions apply to the " + req.getProductName()
                    + " offered to " + req.getCustomerName() + " and form part of your loan Agreement with "
                    + "DigiBank, together with your Key Facts Statement and Repayment Schedule.");

            String[][] sections = {
                {"1. Definitions",
                 "\"Agreement\" means the loan agreement between you and DigiBank Ltd (\"DigiBank\", \"we\", \"us\"), " +
                 "including these Terms and the Key Facts Statement. \"You\" means the borrower named in the " +
                 "Agreement. \"Loan\" means the amount of credit made available to you under the Agreement."},
                {"2. The Loan Facility",
                 "We will make the Loan available by transferring the agreed amount to your nominated account once " +
                 "all conditions of approval have been satisfied, including verification of your identity and " +
                 "supporting documentation. We may decline to release funds if any information you provided is " +
                 "found to be materially inaccurate or incomplete."},
                {"3. Interest",
                 "Interest accrues daily on the outstanding balance at the fixed annual rate stated in your Key " +
                 "Facts Statement, calculated on a reducing-balance basis. The rate is fixed for the full term of " +
                 "the Agreement and will not change unless you and DigiBank agree in writing to vary the Agreement."},
                {"4. Repayment",
                 "You must repay the Loan in the monthly instalments set out in your Repayment Schedule, by direct " +
                 "debit or standing order from the account you nominated when accepting this offer. Each " +
                 "instalment is due on the same calendar day each month; if that day does not exist in a given " +
                 "month, payment is due on the last day of that month."},
                {"5. Early Settlement",
                 "You may repay all or part of the outstanding balance at any time without penalty. Written notice " +
                 "to your DigiBank advisor at least 5 business days beforehand is appreciated so we can prepare an " +
                 "accurate settlement figure, but is not a condition of your right to repay early."},
                {"6. Default and Consequences",
                 "If you miss a scheduled payment, we will apply the default interest rate disclosed in your Key " +
                 "Facts Statement to the overdue amount from the due date until payment is received. We may report " +
                 "missed or late payments to licensed credit reference agencies, which can affect your ability to " +
                 "obtain credit in future. If you fall three or more instalments into arrears, we may declare the " +
                 "full outstanding balance immediately due and payable, subject to any statutory notice requirements."},
                {"7. Right of Cancellation",
                 "You may withdraw from this Agreement without giving any reason within 14 calendar days of it " +
                 "being executed, as described in your Key Facts Statement. Outside that period, this Agreement " +
                 "may only be ended early by full repayment under Section 5."},
                {"8. Changes to These Terms",
                 "We may vary these Terms where required by law or regulation, or to reflect a change in our " +
                 "operating costs, provided any change does not increase the interest rate fixed at the start of " +
                 "your Agreement. We will give you at least 30 days' written notice of any such change."},
                {"9. Data Protection and Credit Reference Agencies",
                 "We process your personal data to assess this application, administer the Loan, and comply with " +
                 "our regulatory obligations, in accordance with applicable Israeli data protection law and the " +
                 "consents you gave during your application. We share information about your conduct of this " +
                 "account with licensed credit reference agencies on an ongoing basis."},
                {"10. Complaints",
                 "If you are unhappy with any aspect of this Agreement or our service, contact your DigiBank " +
                 "advisor in the first instance. If your complaint is not resolved to your satisfaction, you may " +
                 "escalate it through DigiBank's formal complaints procedure, details of which are available on " +
                 "request."},
                {"11. Governing Law",
                 "This Agreement is governed by the laws of the State of Israel, including the Banking Law " +
                 "(Customer Service) 5741-1981 and the Fair Credit Law 5754-1993, and is subject to the exclusive " +
                 "jurisdiction of the competent courts of Israel."},
            };

            for (String[] section : sections) {
                addSectionHeading(doc, fonts, section[0]);
                addParagraph(doc, fonts, section[1]);
            }

            addFooterDisclaimer(doc, fonts);
        });
    }

    // ---- shared letterhead + layout helpers for the 3 offer-pack documents above ---------------

    private record Fonts(PdfFont bold, PdfFont regular) {}

    @FunctionalInterface
    private interface DocumentBody {
        void build(Document doc, Fonts fonts) throws Exception;
    }

    private byte[] withLetterheadDocument(String applicationRef, String title, DocumentBody body) {
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            PdfFont bold = PdfFontFactory.createFont("Helvetica-Bold");
            PdfFont regular = PdfFontFactory.createFont("Helvetica");
            Fonts fonts = new Fonts(bold, regular);

            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdfDoc = new PdfDocument(writer);
            // 90pt top margin leaves room for the repeating letterhead the event handler draws on
            // every page — mirrors pdf-common.ts's newPage()/ensureSpace() repeating the brand
            // header on every page of a multi-page document.
            pdfDoc.addEventHandler(PdfDocumentEvent.START_PAGE, new LetterheadHandler(bold, regular, applicationRef, title));
            Document doc = new Document(pdfDoc, PageSize.A4);
            doc.setMargins(90, 50, 60, 50);

            body.build(doc, fonts);

            doc.close();
            return baos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate PDF", e);
        }
    }

    /** Draws the brand header (logo/title left, reference/date right, yellow rule) on every page —
     * ports pdf-common.ts's newPage(). */
    private static class LetterheadHandler implements IEventHandler {
        private final PdfFont bold;
        private final PdfFont regular;
        private final String applicationRef;
        private final String title;

        LetterheadHandler(PdfFont bold, PdfFont regular, String applicationRef, String title) {
            this.bold = bold;
            this.regular = regular;
            this.applicationRef = applicationRef;
            this.title = title;
        }

        @Override
        public void handleEvent(Event event) {
            PdfDocumentEvent docEvent = (PdfDocumentEvent) event;
            PdfPage page = docEvent.getPage();
            Rectangle pageSize = page.getPageSize();
            float marginX = 50;
            float top = pageSize.getTop() - 40;

            Canvas canvas = new Canvas(page, new Rectangle(marginX, top - 70, pageSize.getWidth() - marginX * 2, 70));

            Table header = new Table(UnitValue.createPercentArray(new float[]{60, 40})).useAllAvailableWidth();
            header.addCell(new Cell()
                    .add(new Paragraph("DigiBank").setFont(bold).setFontSize(18).setFontColor(TCS_BLUE))
                    .add(new Paragraph("Personal Banking").setFont(regular).setFontSize(8).setFontColor(TCS_BLUE))
                    .setBorder(com.itextpdf.layout.borders.Border.NO_BORDER));
            header.addCell(new Cell()
                    .add(new Paragraph(applicationRef).setFont(bold).setFontSize(9).setFontColor(TCS_BLUE))
                    .add(new Paragraph(LocalDate.now().format(DateTimeFormatter.ofPattern("dd MMMM yyyy")))
                            .setFont(regular).setFontSize(8))
                    .setBorder(com.itextpdf.layout.borders.Border.NO_BORDER)
                    .setTextAlignment(TextAlignment.RIGHT));
            canvas.add(header);

            canvas.add(new Table(1).useAllAvailableWidth()
                    .addCell(new Cell().setHeight(3).setBackgroundColor(TCS_YELLOW).setBorder(com.itextpdf.layout.borders.Border.NO_BORDER)));

            canvas.add(new Paragraph(title).setFont(bold).setFontSize(13).setFontColor(TCS_BLUE).setMarginTop(6));
            canvas.close();
        }
    }

    private void addParagraph(Document doc, Fonts fonts, String text) {
        doc.add(new Paragraph(text).setFont(fonts.regular).setFontSize(9.5f).setMarginBottom(10));
    }

    private void addSectionHeading(Document doc, Fonts fonts, String text) {
        doc.add(new Paragraph(text).setFont(fonts.bold).setFontSize(11.5f).setFontColor(TCS_BLUE)
                .setMarginTop(4).setMarginBottom(6));
    }

    private void addKeyValueRow(Document doc, Fonts fonts, String label, String value) {
        Table row = new Table(UnitValue.createPercentArray(new float[]{35, 65})).useAllAvailableWidth().setMarginBottom(2);
        row.addCell(new Cell().add(new Paragraph(label).setFont(fonts.bold).setFontSize(9))
                .setBorder(com.itextpdf.layout.borders.Border.NO_BORDER).setPadding(2));
        row.addCell(new Cell().add(new Paragraph(value).setFont(fonts.regular).setFontSize(9))
                .setBorder(com.itextpdf.layout.borders.Border.NO_BORDER).setPadding(2));
        doc.add(row);
    }

    private void addFooterDisclaimer(Document doc, Fonts fonts) {
        doc.add(new Table(1).useAllAvailableWidth().setMarginTop(14)
                .addCell(new Cell().setHeight(1.5f).setBackgroundColor(TCS_YELLOW).setBorder(com.itextpdf.layout.borders.Border.NO_BORDER)));
        doc.add(new Paragraph(ILLUSTRATIVE_NOTICE).setFont(fonts.regular).setFontSize(7).setFontColor(GREY).setMarginTop(8));
    }

    private void addScheduleHeaderCell(Table table, String text, PdfFont bold) {
        table.addHeaderCell(new Cell().add(new Paragraph(text).setFont(bold).setFontSize(8).setFontColor(TCS_BLUE))
                .setBackgroundColor(LIGHT_GREY).setBorder(com.itextpdf.layout.borders.Border.NO_BORDER).setPadding(4));
    }

    private void addScheduleCell(Table table, String text, PdfFont regular) {
        table.addCell(new Cell().add(new Paragraph(text).setFont(regular).setFontSize(8))
                .setBorder(com.itextpdf.layout.borders.Border.NO_BORDER).setPadding(4));
    }
}
