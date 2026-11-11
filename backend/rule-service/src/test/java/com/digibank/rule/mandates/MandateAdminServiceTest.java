package com.digibank.rule.mandates;

import com.digibank.rule.compliance.ComplianceAuditWriter;
import com.digibank.rule.directory.DirectoryUnavailableException;
import com.digibank.rule.mandates.MandateAdminService.Actor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@RuleDbTest
class MandateAdminServiceTest {

    static final Actor ACTOR = new Actor("Ada Admin", "ADMIN");

    @Autowired MandateRepository mandates;

    FakeDirectory directory;
    ComplianceAuditWriter audit;
    MandateAdminService service;
    MandateResolveService resolve;

    @BeforeEach
    void setUp() {
        directory = new FakeDirectory();
        audit = mock(ComplianceAuditWriter.class);
        service = new MandateAdminService(mandates, directory, audit);
        resolve = new MandateResolveService(mandates, directory);
    }

    private static MandateRequest req(String role, Long unit, String type, Double amount) {
        return new MandateRequest(role, unit, type, amount);
    }

    private static String refusal(Runnable r) {
        try {
            r.run();
        } catch (MandateApiException e) {
            return e.getMessage();
        }
        throw new AssertionError("expected a refusal");
    }

    @Test
    void createsAMandateAndAuditsItInTheWorkersFormat() {
        Mandate saved = service.create(req("UNDERWRITER", 2L, "BUSINESS", 250000d), ACTOR);
        assertThat(saved.getId()).isNotNull();
        assertThat(mandates.findById(saved.getId())).isPresent();
        verify(audit).record("MANDATE_CREATED", "Mandate", String.valueOf(saved.getId()), "Ada Admin", "ADMIN",
                "UNDERWRITER unit=2 type=BUSINESS max=250000");
    }

    @Test
    void anUnscopedMandateIsAuditedAsAny() {
        Mandate saved = service.create(req("COO", null, null, 1.5), ACTOR);
        verify(audit).record(eq("MANDATE_CREATED"), eq("Mandate"), eq(String.valueOf(saved.getId())), any(), any(),
                eq("COO unit=any type=any max=1.5"));
    }

    @Test
    void onlyLadderRolesCanHaveMandates() {
        String msg = "Mandates can only be set for roles on the escalation ladder (give the role a rank first).";
        assertThat(refusal(() -> service.create(req("BANKER", null, null, 1d), ACTOR))).isEqualTo(msg);
        directory.ladder.add(new com.digibank.rule.directory.AuthDirectory.LadderRole("OFF_LADDER", "Off", null));
        assertThat(refusal(() -> service.create(req("OFF_LADDER", null, null, 1d), ACTOR))).isEqualTo(msg);
        assertThat(mandates.count()).isZero();
    }

    @Test
    void theOrgUnitMustExist() {
        assertThat(refusal(() -> service.create(req("UNDERWRITER", 99L, null, 1d), ACTOR))).isEqualTo("Unknown org unit.");
    }

    @Test
    void aSecondMandateForTheSameRoleUnitAndTypeIsRefusedButADifferentTypeIsFine() {
        service.create(req("UNDERWRITER", 2L, "PERSONAL", 10d), ACTOR);
        assertThat(refusal(() -> service.create(req("UNDERWRITER", 2L, "PERSONAL", 20d), ACTOR)))
                .isEqualTo("A mandate for that role, unit and application type already exists - edit it instead.");
        service.create(req("UNDERWRITER", 2L, "BUSINESS", 20d), ACTOR);
        service.create(req("UNDERWRITER", 2L, null, 20d), ACTOR);
        assertThat(mandates.count()).isEqualTo(3);
    }

    @Test
    void anUpdateMayKeepItsOwnKeyButNotTakeAnotherRowsKey() {
        Mandate a = service.create(req("UNDERWRITER", null, null, 10d), ACTOR);
        Mandate b = service.create(req("UNDERWRITER", 2L, null, 20d), ACTOR);
        service.update(a.getId(), req("UNDERWRITER", null, null, 11d), ACTOR);
        assertThat(mandates.findById(a.getId()).orElseThrow().getMaxAmount()).isEqualTo(11d);
        assertThat(refusal(() -> service.update(b.getId(), req("UNDERWRITER", null, null, 5d), ACTOR)))
                .isEqualTo("A mandate for that role, unit and application type already exists - edit it instead.");
        verify(audit).record("MANDATE_UPDATED", "Mandate", String.valueOf(a.getId()), "Ada Admin", "ADMIN", "10 -> 11");
    }

    @Test
    void updatingOrDeletingAMissingMandateIsA404() {
        assertThatThrownBy(() -> service.update(999, req("UNDERWRITER", null, null, 1d), ACTOR))
                .isInstanceOfSatisfying(MandateApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(404);
                    assertThat(e.getMessage()).isEqualTo("Mandate not found.");
                });
        assertThatThrownBy(() -> service.delete(999, ACTOR))
                .isInstanceOfSatisfying(MandateApiException.class, e -> assertThat(e.getStatus()).isEqualTo(404));
    }

    @Test
    void deletingRemovesTheRowAndAuditsIt() {
        Mandate a = service.create(req("CEO", null, null, 500d), ACTOR);
        service.delete(a.getId(), ACTOR);
        assertThat(mandates.findById(a.getId())).isEmpty();
        verify(audit).record("MANDATE_DELETED", "Mandate", String.valueOf(a.getId()), "Ada Admin", "ADMIN", "CEO max=500");
    }

    @Test
    void theAmountMustBeBetweenZeroAndATrillion() {
        assertThat(refusal(() -> service.create(req("CEO", null, null, -1d), ACTOR))).startsWith("maxAmount");
        assertThat(refusal(() -> service.create(req("CEO", null, null, 1e12 + 1), ACTOR))).startsWith("maxAmount");
        assertThat(refusal(() -> service.create(req("CEO", null, null, null), ACTOR))).startsWith("maxAmount");
        service.create(req("CEO", null, null, 0d), ACTOR);
        service.create(req("CEO", 1L, null, 1e12), ACTOR);
        assertThat(refusal(() -> service.create(req("CEO", 2L, "WEIRD", 1d), ACTOR))).startsWith("applicationType");
        assertThat(refusal(() -> service.create(req("", 2L, null, 1d), ACTOR))).startsWith("roleCode");
    }

    @Test
    void overviewListsRowsByRoleCodeThenIdWithTheLadderBesideThem() {
        service.create(req("UNDERWRITER", 2L, null, 1d), ACTOR);
        service.create(req("CEO", null, null, 2d), ACTOR);
        service.create(req("UNDERWRITER", null, null, 3d), ACTOR);
        var o = service.overview();
        assertThat(o.mandates()).extracting(Mandate::getRoleCode, Mandate::getMaxAmount)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("CEO", 2d),
                        org.assertj.core.groups.Tuple.tuple("UNDERWRITER", 1d), org.assertj.core.groups.Tuple.tuple("UNDERWRITER", 3d));
        assertThat(o.ladder()).extracting(l -> l.code()).containsExactly("UNDERWRITER", "SENIOR_UNDERWRITER", "HEAD_OF_LENDING", "COO", "CEO");
    }

    // ---- the resolve service, against stored rows and the org tree

    @Test
    void resolvingWalksTheOrgTreeFromAuthServiceAndNoRowMeansNull() {
        service.create(req("UNDERWRITER", null, null, 100d), ACTOR);
        service.create(req("UNDERWRITER", 2L, null, 500d), ACTOR);
        assertThat(resolve.resolve("UNDERWRITER", 3L, "PERSONAL").limit()).isEqualTo(500d);   // 3 -> 2 matches
        assertThat(resolve.resolve("UNDERWRITER", 1L, "PERSONAL").limit()).isEqualTo(100d);   // 1 is above 2
        assertThat(resolve.resolve("UNDERWRITER", null, null).limit()).isEqualTo(100d);
        assertThat(resolve.resolve("COO", 3L, "PERSONAL").limit()).isNull();                  // no row for the role
    }

    @Test
    void aCaseWithAUnitIsNotResolvedWhenTheOrgTreeCannotBeReadButAUnitlessOneStillIs() {
        service.create(req("UNDERWRITER", null, null, 100d), ACTOR);
        directory.down = true;
        assertThatThrownBy(() -> resolve.resolve("UNDERWRITER", 3L, "PERSONAL")).isInstanceOf(DirectoryUnavailableException.class);
        assertThat(resolve.resolve("UNDERWRITER", null, "PERSONAL").limit()).isEqualTo(100d);
    }
}
