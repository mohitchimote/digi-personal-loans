package com.digibank.rule.affordability.dto;

import java.math.BigDecimal;

/** Wire shape for GET/PUT /internal/rules/affordability — identical field names to the old
 * affordability-service.rules.AffordabilityRules bean, so every caller's JSON contract (including
 * application-service's AffordabilityClient and the Admin Rules page) is unchanged. */
public class AffordabilityRulesDto {

    private BigDecimal maxDti;
    private BigDecimal maxHti;
    private BigDecimal minMonthlyIncome;
    private BigDecimal baseAnnualRate;
    private BigDecimal repaymentCapacityFactor;
    private int minCreditScore;
    private BigDecimal autoApprovalThresholdSingle;
    private BigDecimal autoApprovalThresholdJoint;

    public BigDecimal getMaxDti() { return maxDti; }
    public void setMaxDti(BigDecimal maxDti) { this.maxDti = maxDti; }

    public BigDecimal getMaxHti() { return maxHti; }
    public void setMaxHti(BigDecimal maxHti) { this.maxHti = maxHti; }

    public BigDecimal getMinMonthlyIncome() { return minMonthlyIncome; }
    public void setMinMonthlyIncome(BigDecimal minMonthlyIncome) { this.minMonthlyIncome = minMonthlyIncome; }

    public BigDecimal getBaseAnnualRate() { return baseAnnualRate; }
    public void setBaseAnnualRate(BigDecimal baseAnnualRate) { this.baseAnnualRate = baseAnnualRate; }

    public BigDecimal getRepaymentCapacityFactor() { return repaymentCapacityFactor; }
    public void setRepaymentCapacityFactor(BigDecimal repaymentCapacityFactor) { this.repaymentCapacityFactor = repaymentCapacityFactor; }

    public int getMinCreditScore() { return minCreditScore; }
    public void setMinCreditScore(int minCreditScore) { this.minCreditScore = minCreditScore; }

    public BigDecimal getAutoApprovalThresholdSingle() { return autoApprovalThresholdSingle; }
    public void setAutoApprovalThresholdSingle(BigDecimal autoApprovalThresholdSingle) { this.autoApprovalThresholdSingle = autoApprovalThresholdSingle; }

    public BigDecimal getAutoApprovalThresholdJoint() { return autoApprovalThresholdJoint; }
    public void setAutoApprovalThresholdJoint(BigDecimal autoApprovalThresholdJoint) { this.autoApprovalThresholdJoint = autoApprovalThresholdJoint; }
}
