package com.digibank.application.decisioning;

import com.digibank.application.client.RoleLadderClient;
import com.digibank.application.client.RuleServiceClient;
import com.digibank.application.config.ApiException;
import com.digibank.application.model.CaseReferral;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.model.UnderwritingNote;
import com.digibank.application.repository.CaseReferralRepository;
import com.digibank.application.repository.UnderwritingNoteRepository;
import com.digibank.application.security.AuthenticatedUser;
import com.digibank.application.security.CaseAccess;
import com.digibank.application.security.CurrentUser;
import com.digibank.application.workflow.QueueService;
import com.digibank.application.workflow.QueueService.Order;
import com.digibank.application.workflow.ReferralLadder;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;

/**
 * The staff home dashboard's feeds and the Decision tab's reads, from worker/src/routes/applications.ts: home-stats,
 * staff-activity, a case's mandate and its referral history. Which statuses each feed lists and who may open it come
 * from the published workflow definition's queues (home-stats-staff and -banker, activity-staff and -banker): the
 * first of the pair the caller may open, resolved by workflow-service; all are filtered by the caller's org scope.
 */
@RestController
@RequestMapping("/api/applications")
public class StaffQueueController {

    private final UnderwritingNoteRepository notes;
    private final CaseReferralRepository referrals;
    private final CaseAccess caseAccess;
    private final RuleServiceClient ruleServiceClient;
    private final RoleLadderClient ladder;
    private final QueueService queues;

    public StaffQueueController(UnderwritingNoteRepository notes, CaseReferralRepository referrals, CaseAccess caseAccess,
                                RuleServiceClient ruleServiceClient, RoleLadderClient ladder, QueueService queues) {
        this.notes = notes;
        this.referrals = referrals;
        this.caseAccess = caseAccess;
        this.ruleServiceClient = ruleServiceClient;
        this.ladder = ladder;
        this.queues = queues;
    }

    /** Broader than the pipeline and banker queues: closed-out statuses too, for the dashboard's tiles. */
    @GetMapping("/home-stats")
    public ResponseEntity<List<Map<String, Object>>> homeStats(@RequestParam(required = false) String owner) {
        return ResponseEntity.ok(queues.rows(CurrentUser.get(), List.of("home-stats-staff", "home-stats-banker"), Order.UPDATED_DESC, owner));
    }

    /**
     * Backs the dashboard's Action Items and Recent Notifications panels: the latest 50 notes on cases in the caller's
     * activity queue (which includes IN_PROGRESS for every role: a sent-back case waits on the customer in that status),
     * each carrying the case's own headline fields.
     */
    @GetMapping("/staff-activity")
    public ResponseEntity<List<Map<String, Object>>> staffActivity() {
        AuthenticatedUser user = CurrentUser.get();
        List<LoanApplication> apps = queues.cases(user, List.of("activity-staff", "activity-banker"), Order.UPDATED_DESC);
        if (apps.isEmpty()) return ResponseEntity.ok(List.of());
        Map<String, LoanApplication> byRef = new HashMap<>();
        apps.forEach(a -> byRef.put(a.getApplicationRef(), a));

        List<Map<String, Object>> out = new ArrayList<>();
        for (UnderwritingNote n : notes.findTop50ByApplicationRefInOrderByCreatedAtDesc(byRef.keySet())) {
            LoanApplication app = byRef.get(n.getApplicationRef());
            if (app == null) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", n.getId());
            row.put("applicationRef", n.getApplicationRef());
            row.put("applicationType", app.getApplicationType());
            row.put("customerEmail", app.getCustomerEmail());
            row.put("personalDetailsJson", app.getPersonalDetailsJson());
            row.put("companyDetailsJson", app.getCompanyDetailsJson());
            row.put("applicationStatus", app.getStatus());
            row.put("section", n.getSection());
            row.put("noteType", n.getNoteType());
            row.put("note", n.getNote());
            row.put("createdBy", n.getCreatedBy());
            row.put("createdAt", n.getCreatedAt());
            out.add(row);
        }
        return ResponseEntity.ok(out);
    }

    /**
     * What the caller may approve on THIS case (their role's mandate for the case's org unit and type, from rule-service),
     * and where a referral from them would go. {@code lockedTo} is non-null when the case is referred above the caller:
     * every decision action is then refused by the engine. A role with no mandate row has limit 0, as in the Worker.
     */
    @GetMapping("/{appRef}/mandate")
    public ResponseEntity<Map<String, Object>> mandate(@PathVariable String appRef) {
        LoanApplication app = caseAccess.visible(appRef);
        AuthenticatedUser user = CurrentUser.get();
        Double limit = ruleServiceClient.resolveMandateLimit(user.role(), app.getOrgUnitId(), app.getApplicationType());
        List<RoleLadderClient.LadderRole> roles = ladder.ladder();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("limit", limit == null ? (Object) 0 : limit);
        out.put("nextRole", ReferralLadder.nextRoleUp(roles, user.rank())
                .map(r -> Map.<String, Object>of("code", r.code(), "label", r.label())).orElse(null));
        out.put("lockedTo", ReferralLadder.lockLabel(roles, app, user.rank()));
        return ResponseEntity.ok(out);
    }

    @GetMapping("/{appRef}/referrals")
    public ResponseEntity<List<CaseReferral>> referrals(@PathVariable String appRef) {
        if (!CurrentUser.get().isStaff()) throw new ApiException(403, "Forbidden.");
        caseAccess.visible(appRef);
        return ResponseEntity.ok(referrals.findByApplicationRefOrderByCreatedAtAsc(appRef));
    }
}
