package com.digibank.document.controller;

import com.digibank.document.dto.DocumentGenerationRequest;
import com.digibank.document.model.GeneratedDocument;
import com.digibank.document.model.UploadedDocument;
import com.digibank.document.service.DocumentStorageService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentStorageService storageService;

    public DocumentController(DocumentStorageService storageService) {
        this.storageService = storageService;
    }

    @PostMapping("/generate")
    public ResponseEntity<GeneratedDocument> generate(@RequestBody DocumentGenerationRequest req) throws IOException {
        return ResponseEntity.ok(storageService.generateAndStore(req));
    }

    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<GeneratedDocument>> getByCustomer(@PathVariable Long customerId) {
        return ResponseEntity.ok(storageService.getByCustomer(customerId));
    }

    @GetMapping("/application/{appRef}")
    public ResponseEntity<List<GeneratedDocument>> getByApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(storageService.getByApplication(appRef));
    }

    @GetMapping("/{docId}/download")
    public ResponseEntity<byte[]> download(@PathVariable Long docId) throws IOException {
        GeneratedDocument doc = storageService.getGeneratedById(docId);
        byte[] bytes = storageService.getGeneratedBytes(docId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + doc.getDocumentName() + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(bytes);
    }

    @GetMapping("/{docId}/view")
    public ResponseEntity<byte[]> view(@PathVariable Long docId) throws IOException {
        GeneratedDocument doc = storageService.getGeneratedById(docId);
        byte[] bytes = storageService.getGeneratedBytes(docId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + doc.getDocumentName() + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(bytes);
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
        byte[] bytes = storageService.getUploadedBytes(id);
        MediaType mediaType = doc.getMimeType() != null ? MediaType.parseMediaType(doc.getMimeType()) : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + doc.getOriginalFilename() + "\"")
                .contentType(mediaType)
                .body(bytes);
    }
}
