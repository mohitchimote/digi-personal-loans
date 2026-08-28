package com.digibank.document.generation;

import com.digibank.document.PathSafety;
import com.digibank.document.generation.dto.DocumentGenerationRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Document generation context (ARCHITECTURE.md §10) — server-generated PDFs. Split out of the old
 * DocumentStorageService, which mixed this with the storage.StorageService context (customer
 * uploads).
 */
@Service
public class GenerationService {

    private final GeneratedDocumentRepository generatedRepo;
    private final PdfGeneratorService pdfGenerator;

    @Value("${app.document.storage-path:./document-store}")
    private String storagePath;

    public GenerationService(GeneratedDocumentRepository generatedRepo, PdfGeneratorService pdfGenerator) {
        this.generatedRepo = generatedRepo;
        this.pdfGenerator = pdfGenerator;
    }

    /** The full offer pack a personal-loan decision hands a customer: the cover/approval letter
     * plus its companion Key Facts Statement and Repayment Schedule, appropriate to the decision
     * stage — call with isFinal=false for the conditional offer, isFinal=true for full approval.
     * Also generates Terms & Conditions, but only when isFinal is false, since T&Cs describe the
     * loan product rather than the specific decision and would otherwise be regenerated as an
     * identical duplicate row at final approval. Returns every row created, cover letter first.
     * Ports worker/src/lib/document-pack.ts's generateOfferPack() exactly. */
    public List<GeneratedDocument> generateOfferPack(DocumentGenerationRequest req, boolean isFinal) throws IOException {
        List<GeneratedDocument> results = new ArrayList<>();

        String coverType = isFinal ? "FINAL_APPROVAL_LETTER" : "APPROVAL_LETTER";
        byte[] coverPdf = isFinal ? pdfGenerator.generateFinalApprovalLetter(req) : pdfGenerator.generateApprovalLetter(req);
        results.add(storeDocument(req, coverType, coverPdf));

        byte[] keyFactsPdf = pdfGenerator.generateKeyFactsStatement(req, isFinal);
        results.add(storeDocument(req, "KEY_FACTS_STATEMENT", keyFactsPdf));

        byte[] schedulePdf = pdfGenerator.generateRepaymentSchedule(req);
        results.add(storeDocument(req, "REPAYMENT_SCHEDULE", schedulePdf));

        if (!isFinal) {
            byte[] termsPdf = pdfGenerator.generateTermsAndConditions(req);
            results.add(storeDocument(req, "TERMS_AND_CONDITIONS", termsPdf));
        }

        return results;
    }

    private GeneratedDocument storeDocument(DocumentGenerationRequest req, String documentType, byte[] pdfBytes) throws IOException {
        Path dir = Paths.get(storagePath, "generated", PathSafety.safePathSegment(req.getApplicationRef(), "applicationRef"));
        Files.createDirectories(dir);
        String filename = documentType + "_" + UUID.randomUUID() + ".pdf";
        Path filePath = dir.resolve(filename);
        Files.write(filePath, pdfBytes);

        GeneratedDocument doc = new GeneratedDocument();
        doc.setApplicationRef(req.getApplicationRef());
        doc.setCustomerId(req.getCustomerId());
        doc.setDocumentType(documentType);
        doc.setDocumentName(friendlyName(documentType));
        doc.setFilePath(filePath.toString());
        doc.setFileSize((long) pdfBytes.length);
        doc.setMimeType("application/pdf");
        return generatedRepo.save(doc);
    }

    public byte[] getGeneratedBytes(Long docId) throws IOException {
        GeneratedDocument doc = generatedRepo.findById(docId)
                .orElseThrow(() -> new RuntimeException("Document not found: " + docId));
        return Files.readAllBytes(Paths.get(doc.getFilePath()));
    }

    public GeneratedDocument getGeneratedById(Long docId) {
        return generatedRepo.findById(docId)
                .orElseThrow(() -> new RuntimeException("Document not found: " + docId));
    }

    public List<GeneratedDocument> getByCustomer(Long customerId) {
        return generatedRepo.findByCustomerIdOrderByGeneratedAtDesc(customerId);
    }

    public List<GeneratedDocument> getByApplication(String appRef) {
        return generatedRepo.findByApplicationRefOrderByGeneratedAtDesc(appRef);
    }

    private String friendlyName(String type) {
        return switch (type) {
            case "APPROVAL_LETTER"        -> "Conditional Approval Letter";
            case "FINAL_APPROVAL_LETTER"  -> "Final Approval Letter";
            case "LOAN_AGREEMENT"         -> "Loan Agreement";
            case "REPAYMENT_SCHEDULE"     -> "Repayment Schedule";
            case "KEY_FACTS_STATEMENT"    -> "Key Facts Statement";
            case "TERMS_AND_CONDITIONS"   -> "Terms & Conditions";
            default -> type;
        };
    }
}
