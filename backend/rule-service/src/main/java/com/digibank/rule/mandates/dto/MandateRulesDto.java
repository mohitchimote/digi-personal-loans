package com.digibank.rule.mandates.dto;

import java.math.BigDecimal;

/** Wire shape for GET/PUT /internal/rules/mandates — identical field names to the old
 * application-service.decisioning.MandateRules bean, so every caller's JSON contract is unchanged. */
public class MandateRulesDto {

    private BigDecimal underwriterLimit;
    private BigDecimal seniorUnderwriterLimit;
    private BigDecimal headOfLendingLimit;
    private BigDecimal cooLimit;
    private BigDecimal ceoLimit;

    public BigDecimal getUnderwriterLimit() { return underwriterLimit; }
    public void setUnderwriterLimit(BigDecimal underwriterLimit) { this.underwriterLimit = underwriterLimit; }

    public BigDecimal getSeniorUnderwriterLimit() { return seniorUnderwriterLimit; }
    public void setSeniorUnderwriterLimit(BigDecimal seniorUnderwriterLimit) { this.seniorUnderwriterLimit = seniorUnderwriterLimit; }

    public BigDecimal getHeadOfLendingLimit() { return headOfLendingLimit; }
    public void setHeadOfLendingLimit(BigDecimal headOfLendingLimit) { this.headOfLendingLimit = headOfLendingLimit; }

    public BigDecimal getCooLimit() { return cooLimit; }
    public void setCooLimit(BigDecimal cooLimit) { this.cooLimit = cooLimit; }

    public BigDecimal getCeoLimit() { return ceoLimit; }
    public void setCeoLimit(BigDecimal ceoLimit) { this.ceoLimit = ceoLimit; }
}
