package com.digibank.document.storage;

import com.digibank.document.PathSafety;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;

/**
 * Document storage & retrieval context (ARCHITECTURE.md §10) — customer-uploaded supporting
 * documents. Split out of the old DocumentStorageService, which mixed this with the
 * generation.GenerationService context (server-generated PDFs).
 */
@Service
public class StorageService {

    private final UploadedDocumentRepository uploadedRepo;

    @Value("${app.document.storage-path:./document-store}")
    private String storagePath;

    public StorageService(UploadedDocumentRepository uploadedRepo) {
        this.uploadedRepo = uploadedRepo;
    }

    public UploadedDocument storeUpload(String appRef, Long customerId, String docType, MultipartFile file) throws IOException {
        Path dir = Paths.get(storagePath, "uploaded", PathSafety.safePathSegment(appRef, "applicationRef"));
        Files.createDirectories(dir);
        // getOriginalFilename() is attacker-controlled and may contain path separators/".." —
        // keep only the final path component so it can never resolve outside `dir` (path traversal).
        String originalName = Paths.get(file.getOriginalFilename() != null ? file.getOriginalFilename() : "upload")
                .getFileName().toString();
        String filename = UUID.randomUUID() + "_" + originalName;
        Path filePath = dir.resolve(filename).normalize();
        if (!filePath.startsWith(dir.normalize())) {
            throw new IllegalArgumentException("Invalid file name.");
        }
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

    public UploadedDocument getUploadedById(Long id) {
        return uploadedRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Uploaded document not found: " + id));
    }

    public byte[] getUploadedBytes(Long id) throws IOException {
        UploadedDocument doc = getUploadedById(id);
        return Files.readAllBytes(Paths.get(doc.getStoragePath()));
    }
}
