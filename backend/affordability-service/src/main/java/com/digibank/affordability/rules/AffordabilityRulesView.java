package com.digibank.affordability.rules;

import java.math.BigDecimal;

/**
 * Read-only view of the affordability thresholds — the assessment package (personal
 * AffordabilityService) depends on this, not the mutable AffordabilityRules bean, so it has no way
 * to reach in and change a rule while evaluating a request. Only rules.RulesController (via the
 * concrete AffordabilityRules) is allowed to mutate. See ARCHITECTURE.md §10.
 */
public interface AffordabilityRulesView {
    BigDecimal getMaxDti();
    BigDecimal getMaxHti();
    BigDecimal getMinMonthlyIncome();
    BigDecimal getBaseAnnualRate();
    BigDecimal getRepaymentCapacityFactor();
    int getMinCreditScore();
}
