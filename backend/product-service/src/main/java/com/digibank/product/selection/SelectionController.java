package com.digibank.product.selection;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Product selection context (ARCHITECTURE.md §10) — split out of the old ProductController.
 * Endpoint paths unchanged.
 */
@RestController
@RequestMapping("/api/products")
public class SelectionController {

    private final SelectionService selectionService;

    public SelectionController(SelectionService selectionService) {
        this.selectionService = selectionService;
    }

    @PostMapping("/select")
    public ResponseEntity<ProductSelection> selectProduct(@RequestBody Map<String, Object> body) {
        String appRef = (String) body.get("applicationRef");
        String productCode = (String) body.get("productCode");
        Integer termMonths = body.get("termMonths") != null ? (Integer) body.get("termMonths") : null;
        return ResponseEntity.ok(selectionService.selectProduct(appRef, productCode, termMonths));
    }

    @GetMapping("/selection/{appRef}")
    public ResponseEntity<ProductSelection> getSelection(@PathVariable String appRef) {
        return ResponseEntity.ok(selectionService.getSelection(appRef));
    }
}
