package com.digibank.product.catalog;

import com.digibank.product.catalog.dto.EligibleProduct;
import com.digibank.product.catalog.dto.ProductEligibilityRequest;
import com.digibank.product.model.LoanProduct;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Catalog & eligibility context (ARCHITECTURE.md §10) — split out of the old ProductController.
 * Endpoint paths and role gating unchanged (/admin/** is ADMIN-only per SecurityConfig).
 */
@RestController
@RequestMapping("/api/products")
public class CatalogController {

    private final CatalogService catalogService;

    public CatalogController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @PostMapping("/eligible")
    public ResponseEntity<List<EligibleProduct>> getEligibleProducts(
            @RequestBody ProductEligibilityRequest request) {
        return ResponseEntity.ok(catalogService.getEligibleProducts(request));
    }

    @GetMapping("/admin/all")
    public ResponseEntity<List<LoanProduct>> adminListAll() {
        return ResponseEntity.ok(catalogService.adminListAll());
    }

    @PostMapping("/admin")
    public ResponseEntity<LoanProduct> createProduct(@RequestBody LoanProduct product) {
        return ResponseEntity.status(HttpStatus.CREATED).body(catalogService.createProduct(product));
    }

    @PutMapping("/admin/{id}")
    public ResponseEntity<LoanProduct> updateProduct(@PathVariable Long id, @RequestBody LoanProduct update) {
        return ResponseEntity.ok(catalogService.updateProduct(id, update));
    }

    @DeleteMapping("/admin/{id}")
    public ResponseEntity<Void> deleteProduct(@PathVariable Long id) {
        catalogService.deleteProduct(id);
        return ResponseEntity.noContent().build();
    }
}
