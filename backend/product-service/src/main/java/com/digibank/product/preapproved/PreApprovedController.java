package com.digibank.product.preapproved;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Pre-approved offers context (ARCHITECTURE.md §10) — split out of the old ProductController.
 * Endpoint paths unchanged.
 */
@RestController
@RequestMapping("/api/products")
public class PreApprovedController {

    private final PreApprovedOfferService preApprovedOfferService;

    public PreApprovedController(PreApprovedOfferService preApprovedOfferService) {
        this.preApprovedOfferService = preApprovedOfferService;
    }

    @GetMapping("/pre-approved/{nationalId}")
    public ResponseEntity<PreApprovedOffer> getPreApprovedOffer(@PathVariable String nationalId) {
        PreApprovedOffer offer = preApprovedOfferService.getPreApprovedOffer(nationalId);
        return offer != null ? ResponseEntity.ok(offer) : ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    @PostMapping("/pre-approved/{nationalId}/consume")
    public ResponseEntity<PreApprovedOffer> consumePreApprovedOffer(@PathVariable String nationalId) {
        return ResponseEntity.ok(preApprovedOfferService.consumePreApprovedOffer(nationalId));
    }
}
