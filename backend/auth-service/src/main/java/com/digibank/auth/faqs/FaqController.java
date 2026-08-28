package com.digibank.auth.faqs;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * FAQ context (ARCHITECTURE.md §10) — split out of AuthController (public read) and
 * AdminController (admin CRUD), which each carried half of this resource. Endpoint paths
 * unchanged: GET /api/auth/faqs is public (SecurityConfig permitAll), the rest live under
 * /api/auth/admin/faqs (ADMIN-only) — same mixed-routing pattern already used by
 * branding.BrandingController.
 */
@RestController
public class FaqController {

    private final FaqRepository faqRepository;

    public FaqController(FaqRepository faqRepository) {
        this.faqRepository = faqRepository;
    }

    @GetMapping("/api/auth/faqs")
    public ResponseEntity<List<Faq>> getFaqs() {
        return ResponseEntity.ok(faqRepository.findAllByOrderByCategoryAscDisplayOrderAsc());
    }

    @GetMapping("/api/auth/admin/faqs")
    public ResponseEntity<List<Faq>> getFaqsAdmin() {
        return ResponseEntity.ok(faqRepository.findAllByOrderByCategoryAscDisplayOrderAsc());
    }

    @PostMapping("/api/auth/admin/faqs")
    public ResponseEntity<Faq> createFaq(@RequestBody Faq faq) {
        faq.setId(null);
        return ResponseEntity.status(HttpStatus.CREATED).body(faqRepository.save(faq));
    }

    @PutMapping("/api/auth/admin/faqs/{id}")
    public ResponseEntity<Faq> updateFaq(@PathVariable Long id, @RequestBody Faq update) {
        Faq faq = faqRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("FAQ not found: " + id));
        faq.setCategory(update.getCategory());
        faq.setQuestion(update.getQuestion());
        faq.setAnswer(update.getAnswer());
        faq.setVideoId(update.getVideoId());
        faq.setDisplayOrder(update.getDisplayOrder());
        return ResponseEntity.ok(faqRepository.save(faq));
    }

    @DeleteMapping("/api/auth/admin/faqs/{id}")
    public ResponseEntity<Void> deleteFaq(@PathVariable Long id) {
        faqRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
