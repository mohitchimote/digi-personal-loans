package com.digibank.product.controller;

import com.digibank.product.dto.EligibleProduct;
import com.digibank.product.dto.ProductEligibilityRequest;
import com.digibank.product.model.LoanProduct;
import com.digibank.product.model.PreApprovedOffer;
import com.digibank.product.model.ProductSelection;
import com.digibank.product.service.ProductService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @PostMapping("/eligible")
    public ResponseEntity<List<EligibleProduct>> getEligibleProducts(
            @RequestBody ProductEligibilityRequest request) {
        return ResponseEntity.ok(productService.getEligibleProducts(request));
    }

    @PostMapping("/select")
    public ResponseEntity<ProductSelection> selectProduct(@RequestBody Map<String, Object> body) {
        String appRef = (String) body.get("applicationRef");
        String productCode = (String) body.get("productCode");
        Integer termMonths = body.get("termMonths") != null ? (Integer) body.get("termMonths") : null;
        return ResponseEntity.ok(productService.selectProduct(appRef, productCode, termMonths));
    }

    @GetMapping("/selection/{appRef}")
    public ResponseEntity<ProductSelection> getSelection(@PathVariable String appRef) {
        return ResponseEntity.ok(productService.getSelection(appRef));
    }

    @GetMapping("/pre-approved/{nationalId}")
    public ResponseEntity<PreApprovedOffer> getPreApprovedOffer(@PathVariable String nationalId) {
        PreApprovedOffer offer = productService.getPreApprovedOffer(nationalId);
        return offer != null ? ResponseEntity.ok(offer) : ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    @PostMapping("/pre-approved/{nationalId}/consume")
    public ResponseEntity<PreApprovedOffer> consumePreApprovedOffer(@PathVariable String nationalId) {
        return ResponseEntity.ok(productService.consumePreApprovedOffer(nationalId));
    }

    @GetMapping("/admin/all")
    public ResponseEntity<List<LoanProduct>> adminListAll() {
        return ResponseEntity.ok(productService.adminListAll());
    }

    @PostMapping("/admin")
    public ResponseEntity<LoanProduct> createProduct(@RequestBody LoanProduct product) {
        return ResponseEntity.status(HttpStatus.CREATED).body(productService.createProduct(product));
    }

    @PutMapping("/admin/{id}")
    public ResponseEntity<LoanProduct> updateProduct(@PathVariable Long id, @RequestBody LoanProduct update) {
        return ResponseEntity.ok(productService.updateProduct(id, update));
    }

    @DeleteMapping("/admin/{id}")
    public ResponseEntity<Void> deleteProduct(@PathVariable Long id) {
        productService.deleteProduct(id);
        return ResponseEntity.noContent().build();
    }
}
