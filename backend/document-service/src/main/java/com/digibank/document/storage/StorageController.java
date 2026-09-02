package com.digibank.document.storage;

import com.digibank.document.security.AuthenticatedUser;
import com.digibank.document.security.CurrentUser;
import org.springframework.http.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Set;

/**
 * Document storage & retrieval context (ARCHITECTURE.md §10) — split out of the old
 * DocumentController. Endpoint paths unchanged.
 */
@RestController
@RequestMapping("/api/documents")
public class StorageController {

    // Same duplicated list as application-service's SecurityConfig (tracked separately as Q2) —
    // staff can view/download any customer's documents; a customer may only reach their own (S1).
    private static final Set<String> STAFF_ROLES = Set.of(
            "BANKER", "UNDERWRITER", "SENIOR_UNDERWRITER", "HEAD_OF_LENDING", "COO", "CEO", "ADMIN");

    private static void assertOwnsDocument(Long documentCustomerId) {
        AuthenticatedUser user = CurrentUser.get();
        if (STAFF_ROLES.contains(user.role())) return;
        if (!user.userId().equals(documentCustomerId)) {
            throw new AccessDeniedException("Forbidden.");
        }
    }

    private final StorageService storageService;

    public StorageController(StorageService storageService) {
        this.storageService = storageService;
    }

    @PostMapping("/upload")
    public ResponseEntity<UploadedDocument> upload(
            @RequestParam("file")            MultipartFile file,
            @RequestParam("applicationRef")  String appRef,
            @RequestParam("customerId")      Long customerId,
            @RequestParam(value = "documentType", defaultValue = "SUPPORTING") String docType) throws IOException {
        return ResponseEntity.ok(storageService.storeUpload(appRef, customerId, docType, file));
    }

    @GetMapping("/uploaded/{appRef}")
    public ResponseEntity<List<UploadedDocument>> getUploaded(@PathVariable String appRef) {
        return ResponseEntity.ok(storageService.getUploaded(appRef));
    }

    @GetMapping("/uploaded/file/{id}/view")
    public ResponseEntity<byte[]> viewUploaded(@PathVariable Long id) throws IOException {
        UploadedDocument doc = storageService.getUploadedById(id);
        assertOwnsDocument(doc.getCustomerId());
        byte[] bytes = storageService.getUploadedBytes(id);
        MediaType mediaType = doc.getMimeType() != null ? MediaType.parseMediaType(doc.getMimeType()) : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + doc.getOriginalFilename() + "\"")
                .contentType(mediaType)
                .body(bytes);
    }

    @GetMapping("/uploaded/file/{id}/download")
    public ResponseEntity<byte[]> downloadUploaded(@PathVariable Long id) throws IOException {
        UploadedDocument doc = storageService.getUploadedById(id);
        assertOwnsDocument(doc.getCustomerId());
        byte[] bytes = storageService.getUploadedBytes(id);
        MediaType mediaType = doc.getMimeType() != null ? MediaType.parseMediaType(doc.getMimeType()) : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + doc.getOriginalFilename() + "\"")
                .contentType(mediaType)
                .body(bytes);
    }
}
