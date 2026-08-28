package com.digibank.product.selection;

import com.digibank.product.RepaymentCalculator;
import com.digibank.product.model.LoanProduct;
import com.digibank.product.repository.LoanProductRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Product selection context (ARCHITECTURE.md §10) — which product+term an application picked.
 * Reads LoanProductRepository (owned jointly with catalog, see CatalogService's Javadoc) to look
 * up the chosen product by code; never writes to it.
 */
@Service
public class SelectionService {

    private final LoanProductRepository productRepository;
    private final ProductSelectionRepository selectionRepository;

    public SelectionService(LoanProductRepository productRepository, ProductSelectionRepository selectionRepository) {
        this.productRepository = productRepository;
        this.selectionRepository = selectionRepository;
    }

    public ProductSelection selectProduct(String appRef, String productCode, Integer termMonths) {
        LoanProduct product = productRepository.findByActiveTrue().stream()
                .filter(p -> p.getProductCode().equals(productCode))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Product not found: " + productCode));

        int term = termMonths != null ? termMonths : product.getMinTermMonths();
        BigDecimal monthlyRepayment = RepaymentCalculator.monthlyRepayment(product.getAnnualInterestRate(), new BigDecimal("100000"), term);
        BigDecimal totalRepayable = monthlyRepayment.multiply(new BigDecimal(term)).setScale(2, RoundingMode.HALF_UP);

        ProductSelection selection = ProductSelection.builder()
                .applicationRef(appRef)
                .productCode(product.getProductCode())
                .productName(product.getProductName())
                .termMonths(term)
                .monthlyRepayment(monthlyRepayment)
                .totalRepayable(totalRepayable)
                .apr(product.getAnnualInterestRate())
                .build();

        return selectionRepository.save(selection);
    }

    public ProductSelection getSelection(String appRef) {
        return selectionRepository.findByApplicationRef(appRef)
                .orElseThrow(() -> new IllegalArgumentException("No product selected for application: " + appRef));
    }
}
