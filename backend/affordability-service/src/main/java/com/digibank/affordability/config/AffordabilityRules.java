package com.digibank.affordability.config;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Mutable, runtime-editable affordability rules. Admin-managed via /api/affordability/rules.
 * Resets to defaults on service restart — to be backed by persistent storage / external
 * rules engine post-selection.
 */
@Component
public class AffordabilityRules {

    private BigDecimal maxDti = new BigDecimal("40");
    private BigDecimal maxHti = new BigDecimal("35");
    private BigDecimal minMonthlyIncome = new BigDecimal("8000");
    private BigDecimal baseAnnualRate = new BigDecimal("0.06");
    private BigDecimal repaymentCapacityFactor = new BigDecimal("0.40");
    private int minCreditScore = 580;
    private BigDecimal autoApprovalThresholdSingle = new BigDecimal("30000");
    private BigDecimal autoApprovalThresholdJoint = new BigDecimal("50000");

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
