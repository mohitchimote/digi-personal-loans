package com.digibank.document.service;

import com.digibank.document.dto.DocumentGenerationRequest;
import com.digibank.document.model.GeneratedDocument;
import com.digibank.document.model.UploadedDocument;
import com.digibank.document.repository.GeneratedDocumentRepository;
import com.digibank.document.repository.UploadedDocumentRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;

@Service
public class DocumentStorageService {

    private final GeneratedDocumentRepository generatedRepo;
    private final UploadedDocumentRepository  uploadedRepo;
    private final PdfGeneratorService         pdfGenerator;

    @Value("${app.document.storage-path:./document-store}")
    private String storagePath;

    public DocumentStorageService(GeneratedDocumentRepository generatedRepo,
                                   UploadedDocumentRepository uploadedRepo,
                                   PdfGeneratorService pdfGenerator) {
        this.generatedRepo = generatedRepo;
        this.uploadedRepo = uploadedRepo;
        this.pdfGenerator = pdfGenerator;
    }

    public GeneratedDocument generateAndStore(DocumentGenerationRequest req) throws IOException {
        byte[] pdfBytes = switch (req.getDocumentType()) {
            case "APPROVAL_LETTER" -> pdfGenerator.generateApprovalLetter(req);
            default -> throw new IllegalArgumentException("Unknown document type: " + req.getDocumentType());
        };

        Path dir = Paths.get(storagePath, "generated", req.getApplicationRef());
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

    public UploadedDocument storeUpload(String appRef, Long customerId, String docType, MultipartFile file) throws IOException {
        Path dir = Paths.get(storagePath, "uploaded", appRef);
        Files.createDirectories(dir);
        String filename = UUID.randomUUID() + "_" + file.getOriginalFilename();
        Path filePath = dir.resolve(filename);
        Files.write(filePath, file.getBytes());

        UploadedDocument doc = new UploadedDocument();
        doc.setApplicationRef(appRef);
        doc.setCustomerId(customerId);
        doc.setDocumentType(docType);
        doc.setOriginalFilename(file.getOriginalFilename());
        doc.setStoragePath(filePath.toString());
        doc.setFileSize(file.getSize());
        doc.setMimeType(file.getContentType());
        return uploadedRepo.save(doc);
    }

    public List<UploadedDocument> getUploaded(String appRef) {
        return uploadedRepo.findByApplicationRefOrderByUploadedAtDesc(appRef);
    }

    private String friendlyName(String type) {
        return switch (type) {
            case "APPROVAL_LETTER"    -> "Conditional Approval Letter";
            case "LOAN_AGREEMENT"     -> "Loan Agreement";
            case "REPAYMENT_SCHEDULE" -> "Repayment Schedule";
            default -> type;
        };
    }
}
