package com.digibank.product.service;

import com.digibank.product.dto.EligibleProduct;
import com.digibank.product.dto.ProductEligibilityRequest;
import com.digibank.product.model.LoanProduct;
import com.digibank.product.model.PreApprovedOffer;
import com.digibank.product.model.ProductSelection;
import com.digibank.product.repository.LoanProductRepository;
import com.digibank.product.repository.PreApprovedOfferRepository;
import com.digibank.product.repository.ProductSelectionRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ProductService {

    private final LoanProductRepository productRepository;
    private final ProductSelectionRepository selectionRepository;
    private final PreApprovedOfferRepository preApprovedOfferRepository;
    private static final MathContext MC = new MathContext(10, RoundingMode.HALF_UP);

    public ProductService(LoanProductRepository productRepository, ProductSelectionRepository selectionRepository,
                           PreApprovedOfferRepository preApprovedOfferRepository) {
        this.productRepository = productRepository;
        this.selectionRepository = selectionRepository;
        this.preApprovedOfferRepository = preApprovedOfferRepository;
    }

    @PostConstruct
    public void initializeProducts() {
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
        seedPreApprovedOffers();
    }

    /** Demo data only: represents what a real core-banking system would already know about an
     * existing customer and have pre-approved them for, ahead of any application being started. */
    private void seedPreApprovedOffers() {
        if (preApprovedOfferRepository.count() > 0) return;
        String nationalId = "000000050";
        BigDecimal amount = new BigDecimal("120000");
        int term = 60;
        BigDecimal rate = new BigDecimal("4.80");
        BigDecimal monthlyRepayment = calculateRepayment(rate, amount, term);
        BigDecimal totalRepayable = monthlyRepayment.multiply(new BigDecimal(term)).setScale(2, RoundingMode.HALF_UP);

        preApprovedOfferRepository.save(PreApprovedOffer.builder()
                .nationalId(nationalId)
                .productCode("PL001")
                .productName("Premium Personal Loan")
                .annualInterestRate(rate)
                .amount(amount)
                .termMonths(term)
                .monthlyRepayment(monthlyRepayment)
                .totalRepayable(totalRepayable)
                .build());
    }

    public PreApprovedOffer getPreApprovedOffer(String nationalId) {
        return preApprovedOfferRepository.findByNationalIdAndConsumedFalse(nationalId).orElse(null);
    }

    public PreApprovedOffer consumePreApprovedOffer(String nationalId) {
        PreApprovedOffer offer = preApprovedOfferRepository.findByNationalIdAndConsumedFalse(nationalId)
                .orElseThrow(() -> new IllegalArgumentException("No pre-approved offer found for this National ID."));
        offer.setConsumed(true);
        return preApprovedOfferRepository.save(offer);
    }

    public List<EligibleProduct> getEligibleProducts(ProductEligibilityRequest req) {
        List<LoanProduct> allProducts = productRepository.findByActiveTrue();

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

    public ProductSelection selectProduct(String appRef, String productCode, Integer termMonths) {
        LoanProduct product = productRepository.findByActiveTrue().stream()
                .filter(p -> p.getProductCode().equals(productCode))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Product not found: " + productCode));

        int term = termMonths != null ? termMonths : product.getMinTermMonths();
        BigDecimal monthlyRepayment = calculateRepayment(product.getAnnualInterestRate(), new BigDecimal("100000"), term);
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
        BigDecimal monthly = calculateRepayment(p.getAnnualInterestRate(), amount, term);
        BigDecimal total = monthly.multiply(new BigDecimal(term)).setScale(2, RoundingMode.HALF_UP);

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

    private BigDecimal calculateRepayment(BigDecimal annualRate, BigDecimal principal, int termMonths) {
        BigDecimal monthlyRate = annualRate.divide(new BigDecimal("1200"), MC);
        BigDecimal onePlusR = BigDecimal.ONE.add(monthlyRate);
        BigDecimal onePlusRpowN = onePlusR.pow(termMonths, MC);
        return principal.multiply(monthlyRate).multiply(onePlusRpowN)
                .divide(onePlusRpowN.subtract(BigDecimal.ONE), MC)
                .setScale(2, RoundingMode.HALF_UP);
    }
}
