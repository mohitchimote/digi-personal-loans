package com.digibank.product.catalog;

import com.digibank.product.RepaymentCalculator;
import com.digibank.product.catalog.dto.EligibleProduct;
import com.digibank.product.catalog.dto.ProductEligibilityRequest;
import com.digibank.product.model.LoanProduct;
import com.digibank.product.repository.LoanProductRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Catalog & eligibility context (ARCHITECTURE.md §10) — product definitions, eligibility
 * filtering, admin CRUD. LoanProduct/LoanProductRepository stay at the top-level model/repository
 * packages since selection.SelectionService also reads them (a product code lookup at the point a
 * customer picks one) — same "shared entity across contexts" reasoning as
 * application-service.model.LoanApplication.
 */
@Service
public class CatalogService {

    private final LoanProductRepository productRepository;

    public CatalogService(LoanProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @PostConstruct
    public void initializeProducts() {
        backfillMissingProductType();
        if (productRepository.count() == 0) {
            productRepository.saveAll(List.of(
                LoanProduct.builder()
                    .productCode("SL001")
                    .productName("Standard Personal Loan")
                    .description("Our flexible standard loan for a wide range of personal needs including home improvements, weddings, travel, and more.")
                    .annualInterestRate(new BigDecimal("5.50"))
                    .minAmount(new BigDecimal("10000"))
                    .maxAmount(new BigDecimal("150000"))
                    .minTermMonths(12)
                    .maxTermMonths(84)
                    .minCreditScore(6)
                    .minMonthlyIncome(new BigDecimal("8000"))
                    .maxDti(new BigDecimal("40"))
                    .riskCategories("LOW,MEDIUM,HIGH")
                    .active(true)
                    .build(),
                LoanProduct.builder()
                    .productCode("PL001")
                    .productName("Premium Personal Loan")
                    .description("Exclusive premium rates for customers with excellent financial profiles. Ideal for larger purchases or debt consolidation.")
                    .annualInterestRate(new BigDecimal("4.80"))
                    .minAmount(new BigDecimal("50000"))
                    .maxAmount(new BigDecimal("300000"))
                    .minTermMonths(24)
                    .maxTermMonths(60)
                    .minCreditScore(7)
                    .minMonthlyIncome(new BigDecimal("15000"))
                    .maxDti(new BigDecimal("35"))
                    .riskCategories("LOW,MEDIUM")
                    .active(true)
                    .build(),
                LoanProduct.builder()
                    .productCode("EL001")
                    .productName("Express Loan")
                    .description("Fast-tracked approval for smaller amounts with minimal documentation. Funds typically available within 24 hours.")
                    .annualInterestRate(new BigDecimal("6.20"))
                    .minAmount(new BigDecimal("5000"))
                    .maxAmount(new BigDecimal("50000"))
                    .minTermMonths(6)
                    .maxTermMonths(36)
                    .minCreditScore(5)
                    .minMonthlyIncome(new BigDecimal("6000"))
                    .maxDti(new BigDecimal("45"))
                    .riskCategories("LOW,MEDIUM,HIGH")
                    .active(true)
                    .build()
            ));
        }
        seedBusinessProducts();
    }

    /** The productType column is new — pre-existing rows seeded before it existed have it NULL,
     * not "PERSONAL", which would silently break findByActiveTrueAndProductType("PERSONAL") for
     * every already-running personal product. Run once on startup to backfill them. */
    private void backfillMissingProductType() {
        List<LoanProduct> untyped = productRepository.findAll().stream()
                .filter(p -> p.getProductType() == null)
                .toList();
        if (!untyped.isEmpty()) {
            untyped.forEach(p -> p.setProductType("PERSONAL"));
            productRepository.saveAll(untyped);
        }
    }

    private void seedBusinessProducts() {
        if (productRepository.findByActiveTrueAndProductType("BUSINESS").size() > 0) return;
        productRepository.saveAll(List.of(
            LoanProduct.builder()
                .productCode("BTL001")
                .productName("Business Term Loan")
                .description("A lump-sum loan for established businesses to fund expansion, equipment, or major one-off investments, repaid over a fixed term.")
                .annualInterestRate(new BigDecimal("7.00"))
                .minAmount(new BigDecimal("50000"))
                .maxAmount(new BigDecimal("1000000"))
                .minTermMonths(12)
                .maxTermMonths(84)
                .minCreditScore(6)
                .minMonthlyIncome(BigDecimal.ZERO)
                .maxDti(new BigDecimal("100"))
                .riskCategories("LOW,MEDIUM,HIGH")
                .active(true)
                .productType("BUSINESS")
                .build(),
            LoanProduct.builder()
                .productCode("WCL001")
                .productName("Working Capital Line")
                .description("Short-term financing to cover day-to-day operating expenses, payroll, and inventory while awaiting receivables.")
                .annualInterestRate(new BigDecimal("8.20"))
                .minAmount(new BigDecimal("20000"))
                .maxAmount(new BigDecimal("400000"))
                .minTermMonths(6)
                .maxTermMonths(36)
                .minCreditScore(6)
                .minMonthlyIncome(BigDecimal.ZERO)
                .maxDti(new BigDecimal("100"))
                .riskCategories("LOW,MEDIUM,HIGH")
                .active(true)
                .productType("BUSINESS")
                .build(),
            LoanProduct.builder()
                .productCode("EQF001")
                .productName("Equipment Finance Loan")
                .description("Finance for purchasing machinery, vehicles, or other business equipment, secured against the asset itself.")
                .annualInterestRate(new BigDecimal("6.50"))
                .minAmount(new BigDecimal("30000"))
                .maxAmount(new BigDecimal("600000"))
                .minTermMonths(12)
                .maxTermMonths(60)
                .minCreditScore(7)
                .minMonthlyIncome(BigDecimal.ZERO)
                .maxDti(new BigDecimal("100"))
                .riskCategories("LOW,MEDIUM")
                .active(true)
                .productType("BUSINESS")
                .build()
        ));
    }

    public List<LoanProduct> adminListAll() {
        return productRepository.findAllByOrderByProductTypeAscProductNameAsc();
    }

    public LoanProduct createProduct(LoanProduct product) {
        product.setId(null);
        if (product.getProductCode() == null || product.getProductCode().isBlank()) {
            throw new IllegalArgumentException("Product code is required.");
        }
        if (productRepository.existsByProductCode(product.getProductCode())) {
            throw new IllegalArgumentException("Product code already exists: " + product.getProductCode());
        }
        if (product.getProductType() == null || product.getProductType().isBlank()) {
            product.setProductType("PERSONAL");
        }
        return productRepository.save(product);
    }

    public LoanProduct updateProduct(Long id, LoanProduct update) {
        LoanProduct product = productRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Product not found: " + id));
        if (!product.getProductCode().equals(update.getProductCode()) && productRepository.existsByProductCode(update.getProductCode())) {
            throw new IllegalArgumentException("Product code already exists: " + update.getProductCode());
        }
        product.setProductCode(update.getProductCode());
        product.setProductName(update.getProductName());
        product.setDescription(update.getDescription());
        product.setAnnualInterestRate(update.getAnnualInterestRate());
        product.setMinAmount(update.getMinAmount());
        product.setMaxAmount(update.getMaxAmount());
        product.setMinTermMonths(update.getMinTermMonths());
        product.setMaxTermMonths(update.getMaxTermMonths());
        product.setMinCreditScore(update.getMinCreditScore());
        product.setMinMonthlyIncome(update.getMinMonthlyIncome());
        product.setMaxDti(update.getMaxDti());
        product.setRiskCategories(update.getRiskCategories());
        product.setActive(update.isActive());
        product.setProductType(update.getProductType());
        return productRepository.save(product);
    }

    public void deleteProduct(Long id) {
        if (!productRepository.existsById(id)) {
            throw new IllegalArgumentException("Product not found: " + id);
        }
        productRepository.deleteById(id);
    }

    public List<EligibleProduct> getEligibleProducts(ProductEligibilityRequest req) {
        String productType = req.getProductType() != null ? req.getProductType() : "PERSONAL";
        List<LoanProduct> allProducts = productRepository.findByActiveTrueAndProductType(productType);

        List<EligibleProduct> eligible = allProducts.stream()
                .filter(p -> isEligible(p, req))
                .map(p -> toEligibleProduct(p, req))
                .sorted(Comparator.comparing(EligibleProduct::getInterestRate))
                .collect(Collectors.toList());

        // Mark the lowest-rate eligible product as recommended
        if (!eligible.isEmpty()) {
            eligible.get(0).setRecommended(true);
            eligible.get(0).setBadge("Best Rate");
        }

        return eligible;
    }

    private boolean isEligible(LoanProduct p, ProductEligibilityRequest req) {
        if (req.getCreditScore() != null && req.getCreditScore() < p.getMinCreditScore()) return false;
        if (req.getMonthlyGrossIncome() != null && req.getMonthlyGrossIncome().compareTo(p.getMinMonthlyIncome()) < 0) return false;
        if (req.getRequestedAmount() != null && (req.getRequestedAmount().compareTo(p.getMinAmount()) < 0 || req.getRequestedAmount().compareTo(p.getMaxAmount()) > 0)) return false;
        if (req.getDti() != null && req.getDti().compareTo(p.getMaxDti()) > 0) return false;
        if (req.getRiskCategory() != null && p.getRiskCategories() != null) {
            List<String> allowed = Arrays.asList(p.getRiskCategories().split(","));
            if (!allowed.contains(req.getRiskCategory())) return false;
        }
        return true;
    }

    private EligibleProduct toEligibleProduct(LoanProduct p, ProductEligibilityRequest req) {
        int term = req.getRequestedTermMonths() != null ? req.getRequestedTermMonths() : p.getMinTermMonths();
        BigDecimal amount = req.getRequestedAmount() != null ? req.getRequestedAmount() : p.getMinAmount();
        BigDecimal monthly = RepaymentCalculator.monthlyRepayment(p.getAnnualInterestRate(), amount, term);
        BigDecimal total = monthly.multiply(new BigDecimal(term)).setScale(2, java.math.RoundingMode.HALF_UP);

        return EligibleProduct.builder()
                .productId(p.getProductCode())
                .productName(p.getProductName())
                .description(p.getDescription())
                .interestRate(p.getAnnualInterestRate())
                .minAmount(p.getMinAmount())
                .maxAmount(p.getMaxAmount())
                .minTermMonths(p.getMinTermMonths())
                .maxTermMonths(p.getMaxTermMonths())
                .monthlyRepayment(monthly)
                .totalRepayable(total)
                .apr(p.getAnnualInterestRate())
                .recommended(false)
                .build();
    }
}
