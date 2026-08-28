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

    @PostMapping("/generate")
    public ResponseEntity<GeneratedDocument> generate(@RequestBody DocumentGenerationRequest req) throws IOException {
        return ResponseEntity.ok(generationService.generateAndStore(req));
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
