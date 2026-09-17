package com.digibank.product.preapproved;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Pre-approved offers context (ARCHITECTURE.md §10) — split out of the old ProductController.
 * Endpoint paths unchanged, except the lookup below (2026-09-09 architecture review, see
 * ARCHITECTURE_REVIEW_GAPS.md S9).
 */
@RestController
@RequestMapping("/api/products")
public class PreApprovedController {

    private final PreApprovedOfferService preApprovedOfferService;

    public PreApprovedController(PreApprovedOfferService preApprovedOfferService) {
        this.preApprovedOfferService = preApprovedOfferService;
    }

    // POST + wrapper body, not GET + path variable — a customer's national ID shouldn't sit in a
    // browser-facing GET URL (server access logs, browser history, proxy logs). See S9.
    @PostMapping("/pre-approved/lookup")
    public ResponseEntity<PreApprovedOffer> getPreApprovedOffer(@Valid @RequestBody PreApprovedLookupRequest request) {
        PreApprovedOffer offer = preApprovedOfferService.getPreApprovedOffer(request.getNationalId());
        return offer != null ? ResponseEntity.ok(offer) : ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    @PostMapping("/pre-approved/{nationalId}/consume")
    public ResponseEntity<PreApprovedOffer> consumePreApprovedOffer(@PathVariable String nationalId) {
        return ResponseEntity.ok(preApprovedOfferService.consumePreApprovedOffer(nationalId));
    }
}
