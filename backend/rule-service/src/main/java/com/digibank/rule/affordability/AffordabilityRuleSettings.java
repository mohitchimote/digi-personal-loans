package com.digibank.rule.affordability;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/** Singleton row (id is always 1) — replaces the old in-memory affordability-service.rules
 * .AffordabilityRules bean's fields (ARCHITECTURE_REVIEW_GAPS.md, G4/G6). A single settings row is
 * the simplest persistence shape for a value that has exactly one current version, admin-edited as
 * a whole via PUT /internal/rules/affordability. */
@Entity
@Table(name = "affordability_rule_settings")
public class AffordabilityRuleSettings {

    @Id
    private Long id = 1L;

    private BigDecimal maxDti;
    private BigDecimal maxHti;
    private BigDecimal minMonthlyIncome;
    private BigDecimal baseAnnualRate;
    private BigDecimal repaymentCapacityFactor;
    private int minCreditScore;
    private BigDecimal autoApprovalThresholdSingle;
    private BigDecimal autoApprovalThresholdJoint;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

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
