package com.digibank.rule.mandates;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Gives each of the five default ladder roles a role-default mandate (no unit, no type) when it has none, as the
 * Worker's migration 0015 does with "insert where not exists". It never overwrites a row an admin changed.
 * Limits held in the old fixed-limit table (mandate_limits) are carried over first, as the Worker's 0013 carried
 * over mandate_rules, so an upgrade keeps its numbers.
 */
@Component
public class MandateSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(MandateSeeder.class);

    static final Map<String, Double> DEFAULTS = new LinkedHashMap<>();
    static {
        DEFAULTS.put("UNDERWRITER", 100000d);
        DEFAULTS.put("SENIOR_UNDERWRITER", 300000d);
        DEFAULTS.put("HEAD_OF_LENDING", 750000d);
        DEFAULTS.put("COO", 2000000d);
        DEFAULTS.put("CEO", 999999999d);
    }

    private final MandateRepository mandates;
    private final JdbcTemplate jdbc;

    public MandateSeeder(MandateRepository mandates, JdbcTemplate jdbc) {
        this.mandates = mandates;
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        seed();
    }

    /** Returns how many rows were created. */
    public int seed() {
        Map<String, Double> legacy = legacyLimits();
        int created = 0;
        for (Map.Entry<String, Double> d : DEFAULTS.entrySet()) {
            boolean hasDefault = mandates.findByRoleCode(d.getKey()).stream()
                    .anyMatch(m -> m.getOrgUnitId() == null && m.getApplicationType() == null);
            if (hasDefault) continue;
            mandates.save(new Mandate(d.getKey(), null, null, legacy.getOrDefault(d.getKey(), d.getValue())));
            created++;
        }
        return created;
    }

    private Map<String, Double> legacyLimits() {
        Map<String, Double> out = new LinkedHashMap<>();
        try {
            jdbc.query("select role, limit_amount from mandate_limits",
                    rs -> { out.put(rs.getString(1), rs.getDouble(2)); });
        } catch (Exception e) {
            log.debug("No legacy mandate_limits table to carry over");
        }
        return out;
    }
}
