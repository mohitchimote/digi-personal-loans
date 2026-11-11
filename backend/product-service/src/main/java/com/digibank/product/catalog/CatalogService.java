package com.digibank.product.catalog;

import com.digibank.product.RepaymentCalculator;
import com.digibank.product.cache.SimpleCache;
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
import java.util.Map;
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

    private static final String PRODUCTS_CACHE_PREFIX = "products:active:";
    private static final long PRODUCTS_TTL_MS = 30_000;

    private final LoanProductRepository productRepository;
    private final SimpleCache cache;

    public CatalogService(LoanProductRepository productRepository, SimpleCache cache) {
        this.productRepository = productRepository;
        this.cache = cache;
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
        LoanProduct saved = productRepository.save(product);
        cache.evictPrefix(PRODUCTS_CACHE_PREFIX);
        return saved;
    }

    private static BigDecimal dec(Object v) {
        return v == null ? null : new BigDecimal(v.toString());
    }

    private static Integer integer(Object v) {
        return v == null ? null : (v instanceof Number n ? Integer.valueOf(n.intValue()) : Integer.valueOf(v.toString()));
    }

    /** The Worker's partial update: every field is `body.x ?? existing.x`, so a field that is absent or null is left as it is. */
    public LoanProduct updateProduct(Long id, Map<String, Object> body) {
        LoanProduct product = productRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Product not found: " + id));
        Object code = body.get("productCode");
        if (code != null && !code.toString().equals(product.getProductCode()) && productRepository.existsByProductCode(code.toString())) {
            throw new IllegalArgumentException("Product code already exists: " + code);
        }
        if (code != null) product.setProductCode(code.toString());
        if (body.get("productName") != null) product.setProductName(body.get("productName").toString());
        if (body.get("description") != null) product.setDescription(body.get("description").toString());
        if (body.get("annualInterestRate") != null) product.setAnnualInterestRate(dec(body.get("annualInterestRate")));
        if (body.get("minAmount") != null) product.setMinAmount(dec(body.get("minAmount")));
        if (body.get("maxAmount") != null) product.setMaxAmount(dec(body.get("maxAmount")));
        if (body.get("minTermMonths") != null) product.setMinTermMonths(integer(body.get("minTermMonths")));
        if (body.get("maxTermMonths") != null) product.setMaxTermMonths(integer(body.get("maxTermMonths")));
        if (body.get("minCreditScore") != null) product.setMinCreditScore(integer(body.get("minCreditScore")));
        if (body.get("minMonthlyIncome") != null) product.setMinMonthlyIncome(dec(body.get("minMonthlyIncome")));
        if (body.get("maxDti") != null) product.setMaxDti(dec(body.get("maxDti")));
        if (body.get("riskCategories") != null) product.setRiskCategories(body.get("riskCategories").toString());
        if (body.get("active") != null) product.setActive(Boolean.parseBoolean(body.get("active").toString()));
        if (body.get("productType") != null) product.setProductType(body.get("productType").toString());
        LoanProduct saved = productRepository.save(product);
        cache.evictPrefix(PRODUCTS_CACHE_PREFIX);
        return saved;
    }

    public void deleteProduct(Long id) {
        if (!productRepository.existsById(id)) {
            throw new IllegalArgumentException("Product not found: " + id);
        }
        productRepository.deleteById(id);
        cache.evictPrefix(PRODUCTS_CACHE_PREFIX);
    }

    public List<EligibleProduct> getEligibleProducts(ProductEligibilityRequest req) {
        String productType = req.getProductType() != null ? req.getProductType() : "PERSONAL";
        List<LoanProduct> allProducts = cache.get(PRODUCTS_CACHE_PREFIX + productType, PRODUCTS_TTL_MS,
                () -> productRepository.findByActiveTrueAndProductType(productType));

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

    /** Worker's isEligible: every criterion applies only when both the request and the product set it. */
    private boolean isEligible(LoanProduct p, ProductEligibilityRequest req) {
        if (req.getCreditScore() != null && p.getMinCreditScore() != null && req.getCreditScore() < p.getMinCreditScore()) return false;
        if (req.getMonthlyGrossIncome() != null && p.getMinMonthlyIncome() != null
                && req.getMonthlyGrossIncome().compareTo(p.getMinMonthlyIncome()) < 0) return false;
        if (req.getRequestedAmount() != null && p.getMinAmount() != null && p.getMaxAmount() != null
                && (req.getRequestedAmount().compareTo(p.getMinAmount()) < 0 || req.getRequestedAmount().compareTo(p.getMaxAmount()) > 0)) return false;
        if (req.getDti() != null && p.getMaxDti() != null && req.getDti().compareTo(p.getMaxDti()) > 0) return false;
        if (req.getRiskCategory() != null && !req.getRiskCategory().isEmpty()
                && p.getRiskCategories() != null && !p.getRiskCategories().isEmpty()) {
            List<String> allowed = Arrays.asList(p.getRiskCategories().split(","));
            if (!allowed.contains(req.getRiskCategory())) return false;
        }
        return true;
    }

    private EligibleProduct toEligibleProduct(LoanProduct p, ProductEligibilityRequest req) {
        int term = req.getRequestedTermMonths() != null ? req.getRequestedTermMonths()
                : p.getMinTermMonths() != null ? p.getMinTermMonths() : 12;
        BigDecimal amount = req.getRequestedAmount() != null ? req.getRequestedAmount()
                : p.getMinAmount() != null ? p.getMinAmount() : BigDecimal.ZERO;
        BigDecimal rate = p.getAnnualInterestRate() != null ? p.getAnnualInterestRate() : BigDecimal.ZERO;
        BigDecimal monthly = RepaymentCalculator.monthlyRepayment(rate, amount, term);
        BigDecimal total = monthly.multiply(new BigDecimal(term)).setScale(2, java.math.RoundingMode.HALF_UP);

        return EligibleProduct.builder()
                .productId(p.getProductCode())
                .productName(p.getProductName())
                .description(p.getDescription())
                .interestRate(rate)
                .minAmount(p.getMinAmount())
                .maxAmount(p.getMaxAmount())
                .minTermMonths(p.getMinTermMonths())
                .maxTermMonths(p.getMaxTermMonths())
                .monthlyRepayment(monthly)
                .totalRepayable(total)
                .apr(rate)
                .recommended(false)
                .build();
    }
}
