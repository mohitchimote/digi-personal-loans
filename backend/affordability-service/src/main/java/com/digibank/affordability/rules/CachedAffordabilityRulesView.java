package com.digibank.affordability.rules;

import com.digibank.affordability.client.RuleServiceClient;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * The AffordabilityRulesView bean assessment.AffordabilityService is actually wired to
 * (ARCHITECTURE_REVIEW_GAPS.md, G4) — delegates every read to RuleServiceClient's (briefly cached)
 * fetch from rule-service. Assessment still has no way to mutate a rule: this class exposes no
 * setters, same guarantee the old in-memory AffordabilityRulesView split gave when the mutable bean
 * lived in this process.
 */
@Component
public class CachedAffordabilityRulesView implements AffordabilityRulesView {

    private final RuleServiceClient ruleServiceClient;

    public CachedAffordabilityRulesView(RuleServiceClient ruleServiceClient) {
        this.ruleServiceClient = ruleServiceClient;
    }

    @Override public BigDecimal getMaxDti() { return ruleServiceClient.getAffordabilityRules().getMaxDti(); }
    @Override public BigDecimal getMaxHti() { return ruleServiceClient.getAffordabilityRules().getMaxHti(); }
    @Override public BigDecimal getMinMonthlyIncome() { return ruleServiceClient.getAffordabilityRules().getMinMonthlyIncome(); }
    @Override public BigDecimal getBaseAnnualRate() { return ruleServiceClient.getAffordabilityRules().getBaseAnnualRate(); }
    @Override public BigDecimal getRepaymentCapacityFactor() { return ruleServiceClient.getAffordabilityRules().getRepaymentCapacityFactor(); }
    @Override public int getMinCreditScore() { return ruleServiceClient.getAffordabilityRules().getMinCreditScore(); }
}
