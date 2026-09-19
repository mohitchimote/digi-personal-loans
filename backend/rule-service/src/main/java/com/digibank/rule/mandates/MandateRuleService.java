package com.digibank.rule.mandates;

import com.digibank.rule.mandates.dto.MandateRulesDto;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/** Seeds the five-tier hierarchy with the same defaults the old in-memory MandateRules bean shipped
 * with, then persists every subsequent admin edit (ARCHITECTURE_REVIEW_GAPS.md, G6) instead of
 * resetting them on every restart. */
@Service
public class MandateRuleService {

    private static final Map<String, BigDecimal> DEFAULTS = new LinkedHashMap<>();
    static {
        DEFAULTS.put("UNDERWRITER", new BigDecimal("100000"));
        DEFAULTS.put("SENIOR_UNDERWRITER", new BigDecimal("300000"));
        DEFAULTS.put("HEAD_OF_LENDING", new BigDecimal("750000"));
        DEFAULTS.put("COO", new BigDecimal("2000000"));
        DEFAULTS.put("CEO", new BigDecimal("999999999"));
    }

    private final MandateLimitRepository repository;

    public MandateRuleService(MandateLimitRepository repository) {
        this.repository = repository;
    }

    @PostConstruct
    public void seedDefaults() {
        DEFAULTS.forEach((role, limit) -> {
            if (repository.findByRole(role).isEmpty()) {
                MandateLimit entity = new MandateLimit();
                entity.setRole(role);
                entity.setLimitAmount(limit);
                repository.save(entity);
            }
        });
    }

    public MandateRulesDto getRules() {
        MandateRulesDto dto = new MandateRulesDto();
        dto.setUnderwriterLimit(limitFor("UNDERWRITER"));
        dto.setSeniorUnderwriterLimit(limitFor("SENIOR_UNDERWRITER"));
        dto.setHeadOfLendingLimit(limitFor("HEAD_OF_LENDING"));
        dto.setCooLimit(limitFor("COO"));
        dto.setCeoLimit(limitFor("CEO"));
        return dto;
    }

    @Transactional
    public MandateRulesDto updateRules(MandateRulesDto update) {
        setLimit("UNDERWRITER", update.getUnderwriterLimit());
        setLimit("SENIOR_UNDERWRITER", update.getSeniorUnderwriterLimit());
        setLimit("HEAD_OF_LENDING", update.getHeadOfLendingLimit());
        setLimit("COO", update.getCooLimit());
        setLimit("CEO", update.getCeoLimit());
        return getRules();
    }

    private BigDecimal limitFor(String role) {
        return repository.findByRole(role).map(MandateLimit::getLimitAmount).orElse(BigDecimal.ZERO);
    }

    private void setLimit(String role, BigDecimal amount) {
        if (amount == null) return;
        MandateLimit entity = repository.findByRole(role).orElseGet(() -> {
            MandateLimit created = new MandateLimit();
            created.setRole(role);
            return created;
        });
        entity.setLimitAmount(amount);
        repository.save(entity);
    }
}
