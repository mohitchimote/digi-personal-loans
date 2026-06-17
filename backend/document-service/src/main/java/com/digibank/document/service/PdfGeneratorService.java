package com.digibank.document.service;

import com.digibank.document.dto.DocumentGenerationRequest;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
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
import java.util.Locale;

@Service
public class PdfGeneratorService {

    private static final DeviceRgb TCS_BLUE   = new DeviceRgb(0, 63, 121);
    private static final DeviceRgb TCS_YELLOW = new DeviceRgb(245, 162, 0);
    private static final DeviceRgb LIGHT_GREY = new DeviceRgb(245, 245, 245);

    public byte[] generateApprovalLetter(DocumentGenerationRequest req) {
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
            doc.add(new Paragraph("CONDITIONAL APPROVAL LETTER").setFont(bold).setFontSize(16)
                    .setFontColor(TCS_BLUE).setTextAlignment(TextAlignment.CENTER).setMarginBottom(4));
            doc.add(new Paragraph("Personal Loan").setFont(regular).setFontSize(11)
                    .setTextAlignment(TextAlignment.CENTER).setMarginBottom(20));

            // Addressee
            doc.add(new Paragraph("Dear " + req.getCustomerName() + ",").setFont(regular).setFontSize(11).setMarginBottom(10));
            doc.add(new Paragraph(
                    "We are pleased to confirm that your application for a personal loan with DigiBank has been " +
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
            doc.add(new Paragraph("Conditions of Approval").setFont(bold).setFontSize(12).setFontColor(TCS_BLUE).setMarginBottom(8));
            String[] conditions = {
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
            doc.add(new Paragraph(
                    "Please log in to your DigiBank portal and upload the required supporting documents in the Documents section. " +
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
}
