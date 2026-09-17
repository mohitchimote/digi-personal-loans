package com.digibank.integration.cardpayment.dto;

import java.math.BigDecimal;

/** Everything CardPaymentGenerator needs, extracted from the caller's LoanApplication — this
 * service holds no LoanApplication entity/table of its own (same shape as
 * businessfinancials.dto.BusinessFinancialsGenerateRequest). */
public class CardPaymentAuthoriseRequest {

    private String applicationRef;
    private BigDecimal amount;

    public String getApplicationRef() { return applicationRef; }
    public void setApplicationRef(String applicationRef) { this.applicationRef = applicationRef; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
}
