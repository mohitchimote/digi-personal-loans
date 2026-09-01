package com.digibank.document.generation;

import com.digibank.document.generation.dto.DocumentGenerationRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;

/**
 * Document generation context (ARCHITECTURE.md §10) — split out of the old DocumentController.
 * Endpoint paths unchanged.
 */
@RestController
@RequestMapping("/api/documents")
public class GenerationController {

    private final GenerationService generationService;

    public GenerationController(GenerationService generationService) {
        this.generationService = generationService;
    }

    /** Generates the full offer pack (cover letter + Key Facts Statement + Repayment Schedule,
     * plus Terms & Conditions for a conditional offer) in one call, matching
     * worker/src/routes/documents.ts's /generate handler — the response is every document
     * created, cover letter first, not a single document. isFinal is derived from documentType
     * exactly as the Worker does (FINAL_APPROVAL_LETTER vs APPROVAL_LETTER). */
    @PostMapping("/generate")
    public ResponseEntity<List<GeneratedDocument>> generate(@RequestBody DocumentGenerationRequest req) throws IOException {
        if (!"APPROVAL_LETTER".equals(req.getDocumentType()) && !"FINAL_APPROVAL_LETTER".equals(req.getDocumentType())) {
            throw new IllegalArgumentException("Unknown document type: " + req.getDocumentType());
        }
        boolean isFinal = "FINAL_APPROVAL_LETTER".equals(req.getDocumentType());
        return ResponseEntity.ok(generationService.generateOfferPack(req, isFinal));
    }

    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<GeneratedDocument>> getByCustomer(@PathVariable Long customerId) {
        return ResponseEntity.ok(generationService.getByCustomer(customerId));
    }

    @GetMapping("/application/{appRef}")
    public ResponseEntity<List<GeneratedDocument>> getByApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(generationService.getByApplication(appRef));
    }

    @GetMapping("/{docId}/download")
    public ResponseEntity<byte[]> download(@PathVariable Long docId) throws IOException {
        GeneratedDocument doc = generationService.getGeneratedById(docId);
        byte[] bytes = generationService.getGeneratedBytes(docId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + doc.getDocumentName() + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(bytes);
    }

    @GetMapping("/{docId}/view")
    public ResponseEntity<byte[]> view(@PathVariable Long docId) throws IOException {
        GeneratedDocument doc = generationService.getGeneratedById(docId);
        byte[] bytes = generationService.getGeneratedBytes(docId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + doc.getDocumentName() + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(bytes);
    }
}
