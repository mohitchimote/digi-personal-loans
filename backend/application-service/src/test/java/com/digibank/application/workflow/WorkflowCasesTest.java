package com.digibank.application.workflow;

import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Registration at creation, summary refresh and the backfill: all idempotent, none allowed to block the application. */
class WorkflowCasesTest {

    final FakeWorkflowClient wf = new FakeWorkflowClient();
    final LoanApplicationRepository repo = mock(LoanApplicationRepository.class);
    final CaseSummaries summaries = new CaseSummaries(new ObjectMapper().findAndRegisterModules());
    WorkflowCases cases;

    @BeforeEach
    void setUp() {
        cases = new WorkflowCases(wf, summaries, repo, true);
    }

    private static LoanApplication app(String ref) {
        LoanApplication a = LoanApplication.builder().applicationRef(ref).customerId(7L).customerEmail("c@x").status("IN_PROGRESS").applicationType("PERSONAL").orgUnitId(3L).build();
        a.setLoanRequirementsJson("{\"loanAmount\":25000,\"loanPurpose\":\"Car\",\"loanTerm\":36}");
        a.setPersonalDetailsJson("{\"firstName\":\"Noa\",\"lastName\":\"Levi\"}");
        a.setCreatedAt(java.time.LocalDateTime.of(2026, 11, 1, 9, 0));
        return a;
    }

    @Test
    void registeringSendsTheSummaryAndTheCurrentStatus() {
        cases.register(app("A-1"));
        assertThat(wf.calls).containsExactly("register:A-1");
        assertThat(wf.registered.get(0)).containsEntry("status", "IN_PROGRESS").containsEntry("customerId", 7L).containsEntry("orgUnitId", 3L)
                .containsEntry("applicantName", "Noa Levi").containsEntry("amount", 25000.0).containsEntry("purpose", "Car").containsEntry("termMonths", 36)
                .containsEntry("applicationType", "PERSONAL");
    }

    @Test
    void registeringOutsideATransactionPushesAtOnceAndSwallowsAFailure() {
        cases.registerAfterCommit(app("A-1"));
        assertThat(wf.calls).containsExactly("register:A-1");

        wf.failEverything = new WorkflowUnavailableException(null);
        cases.registerAfterCommit(app("A-2")); // must not throw: the case is registered on first use instead
        assertThat(wf.calls).containsExactly("register:A-1", "register:A-2");
    }

    @Test
    void insideATransactionTheRegistrationWaitsForTheCommit() {
        TransactionSynchronizationManager.initSynchronization();
        try {
            cases.registerAfterCommit(app("A-1"));
            assertThat(wf.calls).as("not before the application's transaction has committed").isEmpty();
            List<TransactionSynchronization> syncs = TransactionSynchronizationManager.getSynchronizations();
            assertThat(syncs).hasSize(1);
            syncs.get(0).afterCommit();
            assertThat(wf.calls).containsExactly("register:A-1");
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void aRolledBackTransactionNeverRegistersTheCase() {
        TransactionSynchronizationManager.initSynchronization();
        try {
            cases.registerAfterCommit(app("A-1"));
            // rollback: afterCommit is never called, only afterCompletion
            TransactionSynchronizationManager.getSynchronizations().forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
        assertThat(wf.calls).isEmpty();
    }

    @Test
    void theBackfillSendsEveryApplicationInBatchesAndAddsUpTheAnswers() {
        List<LoanApplication> all = IntStream.range(0, 450).mapToObj(i -> app("A-" + i)).toList();
        when(repo.findAll(any(Pageable.class))).thenAnswer(i -> {
            Pageable p = i.getArgument(0);
            int from = (int) p.getOffset();
            List<LoanApplication> slice = from >= all.size() ? List.of() : all.subList(from, Math.min(all.size(), from + p.getPageSize()));
            return new PageImpl<>(slice, p, all.size());
        });
        wf.backfillAnswer = Map.of("created", 100, "updated", 100, "failed", List.of(Map.of("applicationRef", "A-9", "error", "boom")));

        Map<String, Object> r = cases.backfillAll();

        assertThat(wf.backfills).extracting(List::size).containsExactly(200, 200, 50);
        assertThat(r).containsEntry("created", 300).containsEntry("updated", 300).containsEntry("batches", 3);
        assertThat((List<?>) r.get("failed")).hasSize(3);
        assertThat(wf.backfills.get(0).get(0)).containsEntry("applicationRef", "A-0").containsEntry("status", "IN_PROGRESS").containsKey("enteredAt");
    }

    @Test
    void backfillingNothingMakesNoCall() {
        when(repo.findAll(any(Pageable.class))).thenReturn(Page.empty());
        assertThat(cases.backfillAll()).containsEntry("created", 0).containsEntry("batches", 0);
        assertThat(wf.calls).isEmpty();
    }

    @Test
    void aBackfillThatCannotReachWorkflowServiceFailsLoudlyForTheAdminEndpoint() {
        when(repo.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(new ArrayList<>(List.of(app("A-1")))));
        wf.failEverything = new WorkflowUnavailableException(null);
        assertThatThrownBy(() -> cases.backfillAll()).isInstanceOf(WorkflowUnavailableException.class);
    }

    @Test
    void theStartupBackfillIsSwitchedOffByItsProperty() throws Exception {
        WorkflowCases off = new WorkflowCases(wf, summaries, repo, false);
        off.backfillOnStartup();
        Thread.sleep(150);
        assertThat(wf.calls).isEmpty();
    }
}
