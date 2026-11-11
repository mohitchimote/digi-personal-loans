package com.digibank.rule.mandates;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@RuleDbTest
class MandateSeederTest {

    @Autowired MandateRepository mandates;
    @Autowired JdbcTemplate jdbc;

    private MandateSeeder seeder() {
        return new MandateSeeder(mandates, jdbc);
    }

    @Test
    void seedsTheFiveRoleDefaultsOnceAndOnlyOnce() {
        assertThat(seeder().seed()).isEqualTo(5);
        assertThat(mandates.findAll()).hasSize(5);
        assertThat(mandates.findByRoleCode("COO")).singleElement().satisfies(m -> {
            assertThat(m.getMaxAmount()).isEqualTo(2000000d);
            assertThat(m.getOrgUnitId()).isNull();
            assertThat(m.getApplicationType()).isNull();
        });
        assertThat(seeder().seed()).isZero();
        assertThat(mandates.findAll()).hasSize(5);
    }

    @Test
    void neverOverwritesALimitAnAdminChanged() {
        seeder().seed();
        Mandate uw = mandates.findByRoleCode("UNDERWRITER").get(0);
        uw.setMaxAmount(42);
        mandates.saveAndFlush(uw);
        seeder().seed();
        assertThat(mandates.findByRoleCode("UNDERWRITER").get(0).getMaxAmount()).isEqualTo(42d);
    }

    @Test
    void aRoleThatOnlyHasAContextRowStillGetsItsDefault() {
        mandates.saveAndFlush(new Mandate("CEO", 3L, null, 5));
        assertThat(seeder().seed()).isEqualTo(5);
        assertThat(mandates.findByRoleCode("CEO")).hasSize(2);
    }

    @Test
    void carriesOverLimitsFromTheOldFixedLimitTable() {
        jdbc.execute("create table mandate_limits (id bigint primary key, role varchar(100), limit_amount decimal(19,2))");
        try {
            jdbc.update("insert into mandate_limits values (1, 'UNDERWRITER', 123456.00)");
            seeder().seed();
            assertThat(mandates.findByRoleCode("UNDERWRITER").get(0).getMaxAmount()).isEqualTo(123456d);
            assertThat(mandates.findByRoleCode("CEO").get(0).getMaxAmount()).isEqualTo(999999999d);
        } finally {
            jdbc.execute("drop table mandate_limits");
        }
    }
}
