package com.digibank.application.workflow;

import com.digibank.application.client.RoleLadderClient;
import com.digibank.application.client.RoleLadderClient.LadderRole;
import com.digibank.application.config.ApiException;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.org.OrgScope;
import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.security.AuthenticatedUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Queues are the definition's: statuses, org scope and the referral filter come from workflow-service. */
class QueueServiceTest {

    static final List<String> PIPELINE = List.of("SUBMITTED", "REFERRED_TO_SENIOR");
    static final List<LadderRole> LADDER = List.of(new LadderRole("UNDERWRITER", "Underwriter", 1), new LadderRole("SENIOR_UNDERWRITER", "Senior Underwriter", 2),
            new LadderRole("COO", "COO", 4));

    final FakeWorkflowClient wf = new FakeWorkflowClient();
    final LoanApplicationRepository repo = mock(LoanApplicationRepository.class);
    final OrgScope scope = mock(OrgScope.class);
    final RoleLadderClient ladder = mock(RoleLadderClient.class);
    QueueService service;

    @BeforeEach
    void setUp() {
        service = new QueueService(wf, repo, scope, ladder, new ObjectMapper().findAndRegisterModules());
        when(ladder.ladder()).thenReturn(LADDER);
        when(scope.filter(any(), any())).thenAnswer(i -> i.getArgument(1));
    }

    private static AuthenticatedUser user(Integer rank) {
        return new AuthenticatedUser("u", 5L, "UNDERWRITER", "Una", Set.of("queue.pipeline"), "ALL", 3L, rank, "Underwriter", null);
    }

    private static LoanApplication app(String ref, String status, String referredTo) {
        LoanApplication a = LoanApplication.builder().applicationRef(ref).customerId(1L).customerEmail("c@x").status(status).build();
        a.setReferredToRole(referredTo);
        return a;
    }

    @Test
    void theStatusesAndTheActorGoToWorkflowServiceAndTheRepositoryIsAskedForExactlyThoseStatuses() {
        wf.queueAnswer = new QueueSettings("pipeline", PIPELINE, false, false);
        when(repo.findByStatusInOrderBySubmittedAtAsc(PIPELINE)).thenReturn(List.of(app("A-1", "SUBMITTED", null)));

        List<LoanApplication> out = service.cases(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC);

        assertThat(out).extracting(LoanApplication::getApplicationRef).containsExactly("A-1");
        assertThat(wf.calls).containsExactly("queues:pipeline");
        verify(repo, never()).findByStatusInOrderByUpdatedAtDesc(any());
        verifyNoInteractions(scope);
    }

    @Test
    void theUpdatedOrderUsesTheOtherQuery() {
        wf.queueAnswer = new QueueSettings("home", PIPELINE, false, false);
        when(repo.findByStatusInOrderByUpdatedAtDesc(PIPELINE)).thenReturn(List.of(app("A-1", "SUBMITTED", null)));
        assertThat(service.cases(user(1), List.of("home"), QueueService.Order.UPDATED_DESC)).hasSize(1);
    }

    @Test
    void theOrgScopeFilterIsAppliedOnlyWhenTheDefinitionSaysSo() {
        List<LoanApplication> all = List.of(app("A-1", "SUBMITTED", null), app("A-2", "SUBMITTED", null));
        when(repo.findByStatusInOrderBySubmittedAtAsc(PIPELINE)).thenReturn(all);
        when(scope.filter(any(), any())).thenReturn(List.of(all.get(0)));

        wf.queueAnswer = new QueueSettings("pipeline", PIPELINE, true, false);
        assertThat(service.cases(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC)).extracting(LoanApplication::getApplicationRef).containsExactly("A-1");

        wf.queueAnswer = new QueueSettings("pipeline", PIPELINE, false, false);
        assertThat(service.cases(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC)).hasSize(2);
    }

    @Test
    void aCaseReferredAboveTheCallersRankLeavesTheirQueueWhenTheDefinitionHidesIt() {
        List<LoanApplication> all = List.of(app("A-1", "SUBMITTED", null), app("A-2", "REFERRED_TO_SENIOR", "SENIOR_UNDERWRITER"),
                app("A-3", "REFERRED_TO_SENIOR", "UNDERWRITER"), app("A-4", "REFERRED_TO_SENIOR", "COO"), app("A-5", "SUBMITTED", "COO"));
        when(repo.findByStatusInOrderBySubmittedAtAsc(PIPELINE)).thenReturn(all);

        wf.queueAnswer = new QueueSettings("pipeline", PIPELINE, false, true);
        assertThat(service.cases(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC)).extracting(LoanApplication::getApplicationRef)
                .containsExactly("A-1", "A-3", "A-5");
        assertThat(service.cases(user(2), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC)).extracting(LoanApplication::getApplicationRef)
                .containsExactly("A-1", "A-2", "A-3", "A-5");
        assertThat(service.cases(user(4), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC)).hasSize(5);
        assertThat(service.cases(user(null), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC)).as("a role off the ladder is unrestricted").hasSize(5);

        wf.queueAnswer = new QueueSettings("pipeline", PIPELINE, false, false);
        assertThat(service.cases(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC)).as("the definition may switch the filter off").hasSize(5);
    }

    @Test
    void aQueueTheActorMayNotOpenIsRefusedAndNothingIsRead() {
        wf.queueAnswer = null; // FakeWorkflowClient answers 403 Forbidden.
        assertThatThrownBy(() -> service.cases(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getStatus()).isEqualTo(403));
        verifyNoInteractions(repo);
    }

    @Test
    void workflowServiceDownMeansNoQueueAt503() {
        wf.failEverything = new WorkflowUnavailableException(null);
        assertThatThrownBy(() -> service.cases(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getStatus()).isEqualTo(503));
    }

    @Test
    void rowsCarryTheirWorkflowInfoAndTheOwnerFilterNarrowsThem() {
        wf.queueAnswer = new QueueSettings("pipeline", PIPELINE, false, false);
        when(repo.findByStatusInOrderBySubmittedAtAsc(PIPELINE)).thenReturn(List.of(app("A-1", "SUBMITTED", null), app("A-2", "SUBMITTED", null), app("A-3", "SUBMITTED", null)));
        wf.infoAnswer = Map.of("A-1", Map.of("stage", "uw", "assigneeUserId", 5), "A-2", Map.of("stage", "uw", "assigneeUserId", 9), "A-3", Map.of("stage", "uw"));

        List<Map<String, Object>> all = service.rows(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC, null);
        assertThat(all).extracting(r -> r.get("applicationRef")).containsExactly("A-1", "A-2", "A-3");
        assertThat(all.get(0).get("workflow")).isEqualTo(Map.of("stage", "uw", "assigneeUserId", 5));
        assertThat(all.get(0)).containsKeys("status", "customerEmail");

        assertThat(service.rows(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC, "me")).extracting(r -> r.get("applicationRef")).containsExactly("A-1");
        assertThat(service.rows(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC, "unassigned")).extracting(r -> r.get("applicationRef")).containsExactly("A-3");
    }

    @Test
    void aCaseWorkflowServiceDoesNotKnowHasNullWorkflowAndCountsAsUnassigned() {
        wf.queueAnswer = new QueueSettings("pipeline", PIPELINE, false, false);
        when(repo.findByStatusInOrderBySubmittedAtAsc(PIPELINE)).thenReturn(List.of(app("A-1", "SUBMITTED", null)));
        List<Map<String, Object>> rows = service.rows(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC, "unassigned");
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0)).containsEntry("workflow", null);
        assertThat(service.rows(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC, "me")).isEmpty();
    }

    @Test
    void ifOnlyTheInfoCallFailsTheListIsStillServed() {
        wf.queueAnswer = new QueueSettings("pipeline", PIPELINE, false, false);
        when(repo.findByStatusInOrderBySubmittedAtAsc(PIPELINE)).thenReturn(List.of(app("A-1", "SUBMITTED", null)));
        FakeWorkflowClient infoDown = new FakeWorkflowClient() {
            @Override public Map<String, Map<String, Object>> info(java.util.Collection<String> refs) { throw new WorkflowUnavailableException(null); }
        };
        infoDown.queueAnswer = wf.queueAnswer;
        QueueService s = new QueueService(infoDown, repo, scope, ladder, new ObjectMapper().findAndRegisterModules());
        List<Map<String, Object>> rows = s.rows(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC, null);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0)).containsEntry("workflow", null);
    }

    @Test
    void anEmptyQueueSkipsTheInfoCall() {
        wf.queueAnswer = new QueueSettings("pipeline", PIPELINE, false, false);
        when(repo.findByStatusInOrderBySubmittedAtAsc(PIPELINE)).thenReturn(List.of());
        assertThat(service.rows(user(1), List.of("pipeline"), QueueService.Order.SUBMITTED_ASC, null)).isEmpty();
        assertThat(wf.calls).containsExactly("queues:pipeline");
    }
}
