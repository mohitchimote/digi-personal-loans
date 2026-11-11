package com.digibank.application.workflow;

import com.digibank.application.client.RoleLadderClient.LadderRole;
import com.digibank.application.model.LoanApplication;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ReferralLadderTest {

    static final List<LadderRole> LADDER = List.of(new LadderRole("COO", "COO", 4), new LadderRole("UNDERWRITER", "Underwriter", 1),
            new LadderRole("SENIOR_UNDERWRITER", "Senior Underwriter", 2));

    private static LoanApplication referred(String status, String to) {
        LoanApplication a = LoanApplication.builder().applicationRef("A").customerId(1L).customerEmail("c@x").status(status).build();
        a.setReferredToRole(to);
        return a;
    }

    @Test
    void nextRoleUpIsTheNearestRankAboveAndNoneAtTheTop() {
        assertThat(ReferralLadder.nextRoleUp(LADDER, 1)).get().extracting(LadderRole::code).isEqualTo("SENIOR_UNDERWRITER");
        assertThat(ReferralLadder.nextRoleUp(LADDER, 2)).get().extracting(LadderRole::code).isEqualTo("COO");
        assertThat(ReferralLadder.nextRoleUp(LADDER, 4)).isEmpty();
        assertThat(ReferralLadder.nextRoleUp(LADDER, null)).as("no rank counts as below everyone").get().extracting(LadderRole::code).isEqualTo("UNDERWRITER");
        assertThat(ReferralLadder.nextRoleUp(List.of(), 1)).isEmpty();
    }

    @Test
    void roleCodesAboveAreTheStrictlyHigherRanks() {
        assertThat(ReferralLadder.roleCodesAbove(LADDER, 2)).containsExactly("COO");
        assertThat(ReferralLadder.roleCodesAbove(LADDER, 1)).containsExactlyInAnyOrder("COO", "SENIOR_UNDERWRITER");
        assertThat(ReferralLadder.roleCodesAbove(LADDER, 4)).isEmpty();
    }

    @Test
    void aCaseIsLockedOnlyWhileReferredToARoleAboveTheCaller() {
        assertThat(ReferralLadder.lockLabel(LADDER, referred("REFERRED_TO_SENIOR", "COO"), 2)).isEqualTo("COO");
        assertThat(ReferralLadder.lockLabel(LADDER, referred("REFERRED_TO_SENIOR", "COO"), 4)).as("the target itself").isNull();
        assertThat(ReferralLadder.lockLabel(LADDER, referred("REFERRED_TO_SENIOR", "SENIOR_UNDERWRITER"), 4)).as("someone above the target").isNull();
        assertThat(ReferralLadder.lockLabel(LADDER, referred("UNDER_REVIEW", "COO"), 1)).as("only while the case is referred").isNull();
        assertThat(ReferralLadder.lockLabel(LADDER, referred("REFERRED_TO_SENIOR", null), 1)).isNull();
        assertThat(ReferralLadder.lockLabel(LADDER, referred("REFERRED_TO_SENIOR", "COO"), null)).as("a role off the ladder is never locked").isNull();
        assertThat(ReferralLadder.lockLabel(LADDER, referred("REFERRED_TO_SENIOR", "GHOST"), 1)).as("a target off the ladder locks nothing").isNull();
    }
}
