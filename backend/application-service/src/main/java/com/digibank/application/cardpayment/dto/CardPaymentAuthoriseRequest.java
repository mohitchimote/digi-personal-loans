package com.digibank.application.cardpayment.dto;

import java.math.BigDecimal;

/** Wire shape posted to integration-service's /internal/integration/card-payment/authorise. */
public class CardPaymentAuthoriseRequest {

    private String applicationRef;
    private BigDecimal amount;

    public String getApplicationRef() { return applicationRef; }
    public void setApplicationRef(String applicationRef) { this.applicationRef = applicationRef; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
}
