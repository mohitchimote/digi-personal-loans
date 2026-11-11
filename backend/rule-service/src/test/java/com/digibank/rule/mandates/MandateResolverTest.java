package com.digibank.rule.mandates;

import com.digibank.rule.mandates.MandateResolver.Resolved;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The Worker's resolveMandate rules (lib/mandates.ts), one behaviour per test. */
class MandateResolverTest {

    // Head Office (1) > Region North (2) > Branch Haifa (3)
    static final Map<Long, Long> PARENTS = parents();

    static Map<Long, Long> parents() {
        Map<Long, Long> m = new HashMap<>();
        m.put(1L, null);
        m.put(2L, 1L);
        m.put(3L, 2L);
        return m;
    }

    static Mandate row(Long unit, String type, double amount) {
        return new Mandate("UNDERWRITER", unit, type, amount);
    }

    static Resolved resolve(List<Mandate> rows, Long unit, String type) {
        return MandateResolver.resolve(rows, MandateResolver.ancestorChain(PARENTS, unit), type);
    }

    @Test
    void noRowAtAllMeansNoAuthorityAndTheLimitIsNullNotZero() {
        assertThat(resolve(List.of(), 3L, "PERSONAL").limit()).isNull();
    }

    @Test
    void theRoleDefaultAppliesWhenNothingMoreSpecificMatches() {
        Resolved r = resolve(List.of(row(null, null, 100000)), 3L, "PERSONAL");
        assertThat(r.limit()).isEqualTo(100000);
        assertThat(r.orgUnitId()).isNull();
        assertThat(r.applicationType()).isNull();
    }

    @Test
    void aRowForTheCasesOwnUnitBeatsTheDefault() {
        assertThat(resolve(List.of(row(null, null, 100000), row(3L, null, 50000)), 3L, "PERSONAL").limit()).isEqualTo(50000);
    }

    @Test
    void theNearestAncestorWinsOverAFartherOne() {
        List<Mandate> rows = List.of(row(1L, null, 900), row(2L, null, 500), row(null, null, 100));
        assertThat(resolve(rows, 3L, "PERSONAL").limit()).isEqualTo(500);
    }

    @Test
    void aRowForAUnitBelowOrBesideTheCaseDoesNotApply() {
        List<Mandate> rows = List.of(row(3L, null, 500), row(null, null, 100));
        assertThat(resolve(rows, 2L, "PERSONAL").limit()).isEqualTo(100);
        assertThat(resolve(rows, 1L, "PERSONAL").limit()).isEqualTo(100);
    }

    @Test
    void aCaseWithNoUnitOnlyEverSeesTheUnitlessRows() {
        List<Mandate> rows = List.of(row(3L, null, 500), row(null, null, 100));
        assertThat(resolve(rows, null, "PERSONAL").limit()).isEqualTo(100);
        assertThat(resolve(List.of(row(3L, null, 500)), null, "PERSONAL").limit()).isNull();
    }

    @Test
    void aMatchingApplicationTypeBeatsTheUntypedRowInTheSameUnit() {
        List<Mandate> rows = List.of(row(null, null, 100), row(null, "BUSINESS", 700));
        assertThat(resolve(rows, null, "BUSINESS").limit()).isEqualTo(700);
        assertThat(resolve(rows, null, "PERSONAL").limit()).isEqualTo(100);
    }

    @Test
    void aTypedRowForTheOtherTypeIsIgnoredAndNoRowLeftMeansNoAuthority() {
        assertThat(resolve(List.of(row(null, "BUSINESS", 700)), null, "PERSONAL").limit()).isNull();
        assertThat(resolve(List.of(row(null, "BUSINESS", 700)), null, null).limit()).isNull();
    }

    @Test
    void unitProximityOutranksTypeMatch() {
        // The case's own unit has an untyped row; a farther ancestor has the typed one. Unit distance is compared first.
        List<Mandate> rows = List.of(row(3L, null, 40), row(1L, "PERSONAL", 999));
        assertThat(resolve(rows, 3L, "PERSONAL").limit()).isEqualTo(40);
    }

    @Test
    void aZeroLimitIsAnAnswerNotTheAbsenceOfOne() {
        assertThat(resolve(List.of(row(null, null, 0)), null, null).limit()).isEqualTo(0.0);
    }

    @Test
    void theChainIsTheUnitThenEachAncestorAndStopsOnACycle() {
        assertThat(MandateResolver.ancestorChain(PARENTS, 3L)).containsExactly(3L, 2L, 1L);
        assertThat(MandateResolver.ancestorChain(PARENTS, null)).isEmpty();
        assertThat(MandateResolver.ancestorChain(PARENTS, 99L)).containsExactly(99L);
        Map<Long, Long> cycle = new HashMap<>();
        cycle.put(1L, 2L);
        cycle.put(2L, 1L);
        assertThat(MandateResolver.ancestorChain(cycle, 1L)).containsExactly(1L, 2L);
    }
}
