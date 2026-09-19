package com.digibank.application.cardpayment;

import com.digibank.application.cardpayment.dto.CardPaymentResult;
import com.digibank.application.model.LoanApplication;

import java.math.BigDecimal;

/**
 * N1 (ARCHITECTURE_REVIEW_GAPS.md) — the integration seam this context exists around, same pattern
 * as businessfinancials.BusinessFinancialsPort. Today's only implementation
 * (IntegrationServiceCardPaymentAdapter) delegates to integration-service's simulated adapter — a
 * real card processor becomes a second implementation of this interface, with
 * DecisioningService.authoriseFundRelease unchanged.
 */
public interface CardPaymentPort {
    CardPaymentResult authorise(LoanApplication app, BigDecimal amount);
}
