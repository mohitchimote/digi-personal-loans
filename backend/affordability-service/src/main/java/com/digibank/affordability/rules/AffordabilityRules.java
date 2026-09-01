package com.digibank.affordability.rules;

import java.math.BigDecimal;

/**
 * Wire shape for rule-service's GET/PUT /internal/rules/affordability. Fetched/updated via
 * client.RuleServiceClient (ARCHITECTURE_REVIEW_GAPS.md, G4); no longer a Spring-managed bean
 * holding state itself — rule-service persists it now (G6), this is just the deserialized value.
 *
 * Still implements AffordabilityRulesView so it can be handed straight to assessment code that
 * expects the read-only interface, but the actual bean assessment.AffordabilityService is wired to
 * is rules.CachedAffordabilityRulesView, not this class directly (ARCHITECTURE.md §10).
 */
public class AffordabilityRules implements AffordabilityRulesView {

    private BigDecimal maxDti = new BigDecimal("40");
    private BigDecimal maxHti = new BigDecimal("35");
    private BigDecimal minMonthlyIncome = new BigDecimal("8000");
    private BigDecimal baseAnnualRate = new BigDecimal("0.06");
    private BigDecimal repaymentCapacityFactor = new BigDecimal("0.40");
    private int minCreditScore = 5;
    private BigDecimal autoApprovalThresholdSingle = new BigDecimal("30000");
    private BigDecimal autoApprovalThresholdJoint = new BigDecimal("50000");

    @Override public BigDecimal getMaxDti() { return maxDti; }
    public void setMaxDti(BigDecimal maxDti) { this.maxDti = maxDti; }

    @Override public BigDecimal getMaxHti() { return maxHti; }
    public void setMaxHti(BigDecimal maxHti) { this.maxHti = maxHti; }

    @Override public BigDecimal getMinMonthlyIncome() { return minMonthlyIncome; }
    public void setMinMonthlyIncome(BigDecimal minMonthlyIncome) { this.minMonthlyIncome = minMonthlyIncome; }

    @Override public BigDecimal getBaseAnnualRate() { return baseAnnualRate; }
    public void setBaseAnnualRate(BigDecimal baseAnnualRate) { this.baseAnnualRate = baseAnnualRate; }

    @Override public BigDecimal getRepaymentCapacityFactor() { return repaymentCapacityFactor; }
    public void setRepaymentCapacityFactor(BigDecimal repaymentCapacityFactor) { this.repaymentCapacityFactor = repaymentCapacityFactor; }

    @Override public int getMinCreditScore() { return minCreditScore; }
    public void setMinCreditScore(int minCreditScore) { this.minCreditScore = minCreditScore; }

    public BigDecimal getAutoApprovalThresholdSingle() { return autoApprovalThresholdSingle; }
    public void setAutoApprovalThresholdSingle(BigDecimal autoApprovalThresholdSingle) { this.autoApprovalThresholdSingle = autoApprovalThresholdSingle; }

    public BigDecimal getAutoApprovalThresholdJoint() { return autoApprovalThresholdJoint; }
    public void setAutoApprovalThresholdJoint(BigDecimal autoApprovalThresholdJoint) { this.autoApprovalThresholdJoint = autoApprovalThresholdJoint; }
}
