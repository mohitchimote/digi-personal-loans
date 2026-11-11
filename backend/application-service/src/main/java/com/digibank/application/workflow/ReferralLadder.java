package com.digibank.application.workflow;

import com.digibank.application.client.RoleLadderClient.LadderRole;
import com.digibank.application.model.LoanApplication;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Read-side helpers over the escalation ladder, ports of the Worker's nextRoleUp, roleCodesAbove and
 * referralLockLabel (lib/mandates.ts). They only decide what the Decision tab shows and which referred cases a
 * queue hides; whether an action is refused because of the lock, and where a referral may go, is the workflow
 * engine's decision (REFERRAL_LOCK and REFERRAL_TARGET guards) and is not repeated here.
 */
public final class ReferralLadder {

    public static final String REFERRED = "REFERRED_TO_SENIOR";

    private ReferralLadder() {}

    /** The ranked role immediately above {@code rank} (a referral target), or empty at the top. A null rank counts as below everyone. */
    public static Optional<LadderRole> nextRoleUp(List<LadderRole> ladder, Integer rank) {
        int from = rank == null ? -1 : rank;
        return ladder.stream().filter(r -> r.rank() > from).min(Comparator.comparingInt(LadderRole::rank));
    }

    /** Role codes ranked above {@code rank}: used to hide referred cases from more junior roles. */
    public static List<String> roleCodesAbove(List<LadderRole> ladder, int rank) {
        return ladder.stream().filter(r -> r.rank() > rank).map(LadderRole::code).toList();
    }

    /** If the case is referred to a role above the caller's rank, that role's label (the case is locked to it); otherwise null. */
    public static String lockLabel(List<LadderRole> ladder, LoanApplication app, Integer callerRank) {
        if (!REFERRED.equals(app.getStatus()) || app.getReferredToRole() == null || callerRank == null) return null;
        return ladder.stream().filter(r -> r.code().equals(app.getReferredToRole())).findFirst()
                .filter(t -> callerRank < t.rank()).map(LadderRole::label).orElse(null);
    }
}
