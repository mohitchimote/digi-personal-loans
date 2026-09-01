package com.digibank.rule.affordability;

import com.digibank.rule.affordability.dto.AffordabilityRulesDto;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

/** Seeds the same defaults the old in-memory affordability-service.rules.AffordabilityRules bean
 * shipped with, then persists every subsequent admin edit (ARCHITECTURE_REVIEW_GAPS.md, G6) instead
 * of resetting on every restart. */
@Service
public class AffordabilityRuleService {

    private static final Long SETTINGS_ID = 1L;

    private final AffordabilityRuleSettingsRepository repository;

    public AffordabilityRuleService(AffordabilityRuleSettingsRepository repository) {
        this.repository = repository;
    }

    @PostConstruct
    public void seedDefaults() {
        if (repository.existsById(SETTINGS_ID)) return;
        AffordabilityRuleSettings settings = new AffordabilityRuleSettings();
        settings.setId(SETTINGS_ID);
        settings.setMaxDti(new BigDecimal("40"));
        settings.setMaxHti(new BigDecimal("35"));
        settings.setMinMonthlyIncome(new BigDecimal("8000"));
        settings.setBaseAnnualRate(new BigDecimal("0.06"));
        settings.setRepaymentCapacityFactor(new BigDecimal("0.40"));
        settings.setMinCreditScore(5);
        settings.setAutoApprovalThresholdSingle(new BigDecimal("30000"));
        settings.setAutoApprovalThresholdJoint(new BigDecimal("50000"));
        repository.save(settings);
    }

    public AffordabilityRulesDto getRules() {
        return toDto(getSettings());
    }

    @Transactional
    public AffordabilityRulesDto updateRules(AffordabilityRulesDto update) {
        AffordabilityRuleSettings settings = getSettings();
        settings.setMaxDti(update.getMaxDti());
        settings.setMaxHti(update.getMaxHti());
        settings.setMinMonthlyIncome(update.getMinMonthlyIncome());
        settings.setBaseAnnualRate(update.getBaseAnnualRate());
        settings.setRepaymentCapacityFactor(update.getRepaymentCapacityFactor());
        settings.setMinCreditScore(update.getMinCreditScore());
        settings.setAutoApprovalThresholdSingle(update.getAutoApprovalThresholdSingle());
        settings.setAutoApprovalThresholdJoint(update.getAutoApprovalThresholdJoint());
        repository.save(settings);
        return toDto(settings);
    }

    private AffordabilityRuleSettings getSettings() {
        return repository.findById(SETTINGS_ID)
                .orElseThrow(() -> new IllegalStateException("Affordability rule settings row missing — seedDefaults should have created it."));
    }

    private AffordabilityRulesDto toDto(AffordabilityRuleSettings settings) {
        AffordabilityRulesDto dto = new AffordabilityRulesDto();
        dto.setMaxDti(settings.getMaxDti());
        dto.setMaxHti(settings.getMaxHti());
        dto.setMinMonthlyIncome(settings.getMinMonthlyIncome());
        dto.setBaseAnnualRate(settings.getBaseAnnualRate());
        dto.setRepaymentCapacityFactor(settings.getRepaymentCapacityFactor());
        dto.setMinCreditScore(settings.getMinCreditScore());
        dto.setAutoApprovalThresholdSingle(settings.getAutoApprovalThresholdSingle());
        dto.setAutoApprovalThresholdJoint(settings.getAutoApprovalThresholdJoint());
        return dto;
    }
}
