package com.digibank.document.storage;

import com.digibank.document.PathSafety;
import org.apache.tika.Tika;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Document storage & retrieval context (ARCHITECTURE.md §10) — customer-uploaded supporting
 * documents. Split out of the old DocumentStorageService, which mixed this with the
 * generation.GenerationService context (server-generated PDFs).
 */
@Service
public class StorageService {

    // S3 (ARCHITECTURE_REVIEW_GAPS.md) — before this, nothing checked a file's actual content, only
    // trusted whatever Content-Type the client claimed. This is magic-byte detection (Tika sniffs
    // the real bytes, not the filename/header) against the shapes the product's own upload pages
    // accept (frontend/.../verify-id, guarantor-details, documents.component.html's `accept=`
    // attributes) — it is NOT malware scanning; a real AV engine would be new infrastructure
    // (a scanning daemon/API), out of scope here.
    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "application/pdf", "image/jpeg", "image/png",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword");

    private final Tika tika = new Tika();
    private final UploadedDocumentRepository uploadedRepo;

    @Value("${app.document.storage-path:./document-store}")
    private String storagePath;

    public StorageService(UploadedDocumentRepository uploadedRepo) {
        this.uploadedRepo = uploadedRepo;
    }

    public UploadedDocument storeUpload(String appRef, Long customerId, String docType, MultipartFile file) throws IOException {
        byte[] bytes = file.getBytes();
        String detectedType = tika.detect(bytes);
        if (!ALLOWED_MIME_TYPES.contains(detectedType)) {
            throw new IllegalArgumentException(
                    "Unsupported file type: " + detectedType + ". Allowed: PDF, JPEG, PNG, DOC, DOCX.");
        }

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
        Files.write(filePath, bytes);

        UploadedDocument doc = new UploadedDocument();
        doc.setApplicationRef(appRef);
        doc.setCustomerId(customerId);
        doc.setDocumentType(docType);
        doc.setOriginalFilename(file.getOriginalFilename());
        doc.setStoragePath(filePath.toString());
        doc.setFileSize(file.getSize());
        // The detected type, not the client-supplied Content-Type header — the whole point of the
        // check above is that the header can't be trusted.
        doc.setMimeType(detectedType);
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
