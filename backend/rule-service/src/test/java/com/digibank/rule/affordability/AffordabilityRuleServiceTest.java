package com.digibank.rule.affordability;

import com.digibank.rule.affordability.dto.AffordabilityRulesDto;
import com.digibank.rule.mandates.RuleDbTest;
import com.digibank.rule.mandates.WorkerSources;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

@RuleDbTest
class AffordabilityRuleServiceTest {

    @Autowired AffordabilityRuleSettingsRepository repository;

    @Test
    void theSeededDefaultsAreTheWorkersColumnDefaults() {
        AffordabilityRuleService service = new AffordabilityRuleService(repository);
        service.seedDefaults();
        AffordabilityRulesDto r = service.getRules();

        String schema = WorkerSources.read("worker/src/db/schema.ts");
        assertThat(worker(schema, "max_dti")).isEqualByComparingTo(r.getMaxDti());
        assertThat(worker(schema, "max_hti")).isEqualByComparingTo(r.getMaxHti());
        assertThat(worker(schema, "min_monthly_income")).isEqualByComparingTo(r.getMinMonthlyIncome());
        assertThat(worker(schema, "base_annual_rate")).isEqualByComparingTo(r.getBaseAnnualRate());
        assertThat(worker(schema, "repayment_capacity_factor")).isEqualByComparingTo(r.getRepaymentCapacityFactor());
        assertThat(worker(schema, "min_credit_score")).isEqualByComparingTo(new BigDecimal(r.getMinCreditScore()));
        assertThat(worker(schema, "auto_approval_threshold_single")).isEqualByComparingTo(r.getAutoApprovalThresholdSingle());
        assertThat(worker(schema, "auto_approval_threshold_joint")).isEqualByComparingTo(r.getAutoApprovalThresholdJoint());
    }

    private static BigDecimal worker(String schema, String column) {
        Matcher m = Pattern.compile("\"" + column + "\"\\)\\.notNull\\(\\)\\.default\\(([0-9.]+)\\)").matcher(schema);
        assertThat(m.find()).as("column " + column + " in the Worker schema").isTrue();
        return new BigDecimal(m.group(1));
    }

    @Test
    void anUpdateReplacesGivenFieldsAndKeepsTheOnesLeftOut() {
        AffordabilityRuleService service = new AffordabilityRuleService(repository);
        service.seedDefaults();
        AffordabilityRulesDto update = new AffordabilityRulesDto();
        update.setMaxDti(new BigDecimal("45"));
        update.setMinCreditScore(7);
        AffordabilityRulesDto saved = service.updateRules(update);
        assertThat(saved.getMaxDti()).isEqualByComparingTo("45");
        assertThat(saved.getMinCreditScore()).isEqualTo(7);
        assertThat(saved.getMaxHti()).isEqualByComparingTo("35");
        assertThat(saved.getAutoApprovalThresholdJoint()).isEqualByComparingTo("50000");
    }

    @Test
    void seedingTwiceDoesNotResetAnEdit() {
        AffordabilityRuleService service = new AffordabilityRuleService(repository);
        service.seedDefaults();
        AffordabilityRulesDto update = new AffordabilityRulesDto();
        update.setMaxHti(new BigDecimal("30"));
        service.updateRules(update);
        service.seedDefaults();
        assertThat(service.getRules().getMaxHti()).isEqualByComparingTo("30");
    }
}
