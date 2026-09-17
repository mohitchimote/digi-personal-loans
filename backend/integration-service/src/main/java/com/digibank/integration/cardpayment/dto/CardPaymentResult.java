package com.digibank.integration.cardpayment.dto;

import java.math.BigDecimal;

/** Synthetic card-network transaction result — same "fake it" shape as
 * businessfinancials.dto.BusinessFinancialsAnalysis (generatedAt/seed for stability across
 * reloads, no real card network is called). */
public class CardPaymentResult {

    private String transactionId;
    private String status;
    private BigDecimal amount;
    private String cardLast4;
    private String authorisationCode;
    private String generatedAt;
    private String seed;

    public String getTransactionId() { return transactionId; }
    public void setTransactionId(String transactionId) { this.transactionId = transactionId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public String getCardLast4() { return cardLast4; }
    public void setCardLast4(String cardLast4) { this.cardLast4 = cardLast4; }

    public String getAuthorisationCode() { return authorisationCode; }
    public void setAuthorisationCode(String authorisationCode) { this.authorisationCode = authorisationCode; }

    public String getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(String generatedAt) { this.generatedAt = generatedAt; }

    public String getSeed() { return seed; }
    public void setSeed(String seed) { this.seed = seed; }
}
