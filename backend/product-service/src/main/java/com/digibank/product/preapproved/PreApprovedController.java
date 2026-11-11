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
    public ResponseEntity<PreApprovedOffer> getPreApprovedOffer(@RequestBody java.util.Map<String, Object> request) {
        // The Worker's strict zod schema { nationalId: string().min(1) }: same messages, joined by "; ".
        java.util.List<String> issues = new java.util.ArrayList<>();
        java.util.List<String> unknown = request.keySet().stream().filter(k -> !"nationalId".equals(k)).map(k -> "'" + k + "'").toList();
        if (!unknown.isEmpty()) issues.add("(root): Unrecognized key(s) in object: " + String.join(", ", unknown));
        Object nid = request.get("nationalId");
        if (nid == null) issues.add("nationalId: Required");
        else if (!(nid instanceof String)) issues.add("nationalId: Expected string, received " + (nid instanceof Number ? "number" : nid instanceof Boolean ? "boolean" : "object"));
        else if (((String) nid).isEmpty()) issues.add("nationalId: String must contain at least 1 character(s)");
        if (!issues.isEmpty()) throw new IllegalArgumentException("Invalid request: " + String.join("; ", issues));
        PreApprovedOffer offer = preApprovedOfferService.getPreApprovedOffer((String) nid);
        return offer != null ? ResponseEntity.ok(offer) : ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    @PostMapping("/pre-approved/{nationalId}/consume")
    public ResponseEntity<PreApprovedOffer> consumePreApprovedOffer(@PathVariable String nationalId) {
        return ResponseEntity.ok(preApprovedOfferService.consumePreApprovedOffer(nationalId));
    }
}
