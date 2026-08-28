package com.digibank.product.preapproved;

import com.digibank.product.RepaymentCalculator;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Pre-approved offers context (ARCHITECTURE.md §10) — existing-customer fast-track offers, a
 * "fake it" pattern (ARCHITECTURE.md §6.3): represents what a real core-banking system would
 * already know about a customer, ahead of any application being started. No dependency on
 * catalog.CatalogService — seeded offers hardcode their own product name/rate rather than looking
 * up the live catalog, so this context's startup seeding has no ordering dependency on catalog's.
 */
@Service
public class PreApprovedOfferService {

    private final PreApprovedOfferRepository preApprovedOfferRepository;

    public PreApprovedOfferService(PreApprovedOfferRepository preApprovedOfferRepository) {
        this.preApprovedOfferRepository = preApprovedOfferRepository;
    }

    /** Demo data only. Each entry is keyed by nationalId and skipped if already seeded, so adding
     * a new persona here doesn't reset/duplicate offers for ones already seeded on a prior startup. */
    @PostConstruct
    public void seedPreApprovedOffers() {
        seedOfferIfAbsent("000000050", "PL001", "Premium Personal Loan", new BigDecimal("4.80"), new BigDecimal("120000"), 60);
        seedOfferIfAbsent("000000051", "SL001", "Standard Personal Loan", new BigDecimal("5.50"), new BigDecimal("65000"), 48);
        seedOfferIfAbsent("000000052", "EL001", "Express Loan", new BigDecimal("6.20"), new BigDecimal("25000"), 24);
    }

    private void seedOfferIfAbsent(String nationalId, String productCode, String productName,
                                    BigDecimal rate, BigDecimal amount, int term) {
        if (preApprovedOfferRepository.existsByNationalId(nationalId)) return;
        BigDecimal monthlyRepayment = RepaymentCalculator.monthlyRepayment(rate, amount, term);
        BigDecimal totalRepayable = monthlyRepayment.multiply(new BigDecimal(term)).setScale(2, RoundingMode.HALF_UP);

        preApprovedOfferRepository.save(PreApprovedOffer.builder()
                .nationalId(nationalId)
                .productCode(productCode)
                .productName(productName)
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
}
