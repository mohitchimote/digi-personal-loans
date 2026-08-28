package com.digibank.document.generation;

import com.digibank.document.PathSafety;
import com.digibank.document.generation.dto.DocumentGenerationRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
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

    public GeneratedDocument generateAndStore(DocumentGenerationRequest req) throws IOException {
        byte[] pdfBytes = switch (req.getDocumentType()) {
            case "APPROVAL_LETTER" -> pdfGenerator.generateApprovalLetter(req);
            case "FINAL_APPROVAL_LETTER" -> pdfGenerator.generateFinalApprovalLetter(req);
            default -> throw new IllegalArgumentException("Unknown document type: " + req.getDocumentType());
        };

        Path dir = Paths.get(storagePath, "generated", PathSafety.safePathSegment(req.getApplicationRef(), "applicationRef"));
        Files.createDirectories(dir);
        String filename = req.getDocumentType() + "_" + UUID.randomUUID() + ".pdf";
        Path filePath = dir.resolve(filename);
        Files.write(filePath, pdfBytes);

        GeneratedDocument doc = new GeneratedDocument();
        doc.setApplicationRef(req.getApplicationRef());
        doc.setCustomerId(req.getCustomerId());
        doc.setDocumentType(req.getDocumentType());
        doc.setDocumentName(friendlyName(req.getDocumentType()));
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
            case "APPROVAL_LETTER"       -> "Conditional Approval Letter";
            case "FINAL_APPROVAL_LETTER" -> "Final Approval Letter";
            case "LOAN_AGREEMENT"     -> "Loan Agreement";
            case "REPAYMENT_SCHEDULE" -> "Repayment Schedule";
            default -> type;
        };
    }
}
