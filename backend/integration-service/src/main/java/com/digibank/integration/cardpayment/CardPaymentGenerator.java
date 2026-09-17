package com.digibank.integration.cardpayment;

import com.digibank.integration.cardpayment.dto.CardPaymentAuthoriseRequest;
import com.digibank.integration.cardpayment.dto.CardPaymentResult;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Random;
import java.util.UUID;

/**
 * N1 (ARCHITECTURE_REVIEW_GAPS.md) — simulated card-payment adapter, same "fake it" demo-synthesis
 * pattern as businessfinancials.BusinessFinancialsGenerator / dataverification.DataVerificationGenerator
 * (ARCHITECTURE.md §6.3): deterministic seed from applicationRef.hashCode() so the same application
 * always produces the same synthetic result, stable across reloads. No real card processor/PCI
 * scope — a payment-provider decision (which processor, PCI implications) was explicitly out of
 * scope for this pass; this exists so the adapter/port seam is in place and swappable later,
 * without picking a real provider today.
 */
@Component
public class CardPaymentGenerator {

    public CardPaymentResult authorise(CardPaymentAuthoriseRequest request) {
        long seed = request.getApplicationRef().hashCode();
        Random rng = new Random(seed);

        CardPaymentResult result = new CardPaymentResult();
        result.setTransactionId("TXN-" + UUID.nameUUIDFromBytes(
                (request.getApplicationRef() + ":cardpayment").getBytes()).toString().substring(0, 12).toUpperCase());
        result.setStatus("AUTHORISED");
        result.setAmount(request.getAmount());
        result.setCardLast4(String.format("%04d", rng.nextInt(10_000)));
        result.setAuthorisationCode(String.format("%06d", rng.nextInt(1_000_000)));
        result.setGeneratedAt(LocalDateTime.now().toString());
        result.setSeed(request.getApplicationRef());
        return result;
    }
}
