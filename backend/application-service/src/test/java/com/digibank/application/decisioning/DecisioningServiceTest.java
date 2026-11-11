package com.digibank.application.decisioning;

import com.digibank.application.model.LoanApplication;
import com.digibank.application.model.UnderwritingNote;
import com.digibank.application.security.AuthenticatedUser;
import com.digibank.application.workflow.WorkflowActions;
import com.digibank.application.workflow.WorkflowActions.Run;
import com.digibank.application.workflow.WorkflowActor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.math.BigDecimal;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * DecisioningService names the workflow action, passes the inputs and the caller as the actor, and returns the case.
 * It decides nothing itself: every rule is the engine's.
 */
class DecisioningServiceTest {

    static final AuthenticatedUser UNDERWRITER = new AuthenticatedUser("u-1", 50L, "UNDERWRITER", "Una Underwriter",
            Set.of("case.decline", "case.approve"), "UNIT_TREE", 3L, 1, "Underwriter", "una@bank.test");

    final WorkflowActions actions = mock(WorkflowActions.class);
    final DecisioningService service = new DecisioningService(actions);
    final LoanApplication app = LoanApplication.builder().applicationRef("APP-1").customerId(7L).customerEmail("c@x").build();

    @AfterEach
    void clearRequest() {
        RequestContextHolder.resetRequestAttributes();
    }

    private Run capture() {
        ArgumentCaptor<Run> run = ArgumentCaptor.forClass(Run.class);
        verify(actions).run(eq("APP-1"), run.capture());
        return run.getValue();
    }

    private void returns() {
        when(actions.run(eq("APP-1"), org.mockito.ArgumentMatchers.any())).thenReturn(new WorkflowActions.Result(app, null));
    }

    @Test
    void declineIsTheDeclineActionWithTheReasonAndTheCallerAsActor() {
        returns();
        assertThat(service.declineApplication("APP-1", UNDERWRITER, "too risky")).isSameAs(app);
        Run r = capture();
        assertThat(r.action()).isEqualTo("decline");
        assertThat(r.input()).containsEntry("reason", "too risky");
        assertThat(r.actor()).isEqualTo(WorkflowActor.of(UNDERWRITER));
        assertThat(r.actor().type()).isEqualTo("STAFF");
        assertThat(r.actor().name()).isEqualTo("Una Underwriter");
        assertThat(r.actor().entitlements()).containsExactlyInAnyOrder("case.decline", "case.approve");
        assertThat(r.actor().rank()).isEqualTo(1);
        assertThat(r.actor().orgUnitId()).isEqualTo(3L);
        assertThat(r.actor().scope()).isEqualTo("UNIT_TREE");
    }

    @Test
    void aMissingReasonIsPassedOnAsNullForTheEngineToRefuse() {
        returns();
        service.declineApplication("APP-1", UNDERWRITER, null);
        assertThat(capture().input()).containsEntry("reason", null);
    }

    @Test
    void sendBackCarriesTheGuarantorFlag() {
        returns();
        service.sendBackApplication("APP-1", UNDERWRITER, "more docs", true);
        Run r = capture();
        assertThat(r.action()).isEqualTo("send_back");
        assertThat(r.input()).containsEntry("reason", "more docs").containsEntry("requireGuarantor", true);
    }

    @Test
    void approveByUnderwriterIsTheApproveActionWithTheAmount() {
        returns();
        service.approveApplicationByUnderwriter("APP-1", UNDERWRITER, new BigDecimal("50000"));
        Run r = capture();
        assertThat(r.action()).isEqualTo("approve");
        assertThat(r.input().get("approvedAmount")).isEqualTo(new BigDecimal("50000"));
    }

    @Test
    void thePlainApproveIsTheConditionalApproval() {
        returns();
        service.approveApplication("APP-1", UNDERWRITER);
        assertThat(capture().action()).isEqualTo("approve_conditional");
    }

    @Test
    void referCarriesTheReasonAndTheOptionalTargetRole() {
        returns();
        service.referToSeniorUnderwriter("APP-1", UNDERWRITER, "big one", "COO");
        Run r = capture();
        assertThat(r.action()).isEqualTo("refer");
        assertThat(r.input()).containsEntry("reason", "big one").containsEntry("toRole", "COO");
    }

    @Test
    void theDisbursementStepsAreTheirOwnActions() {
        returns();
        service.authoriseFundRelease("APP-1", UNDERWRITER);
        assertThat(capture().action()).isEqualTo("authorise");
        org.mockito.Mockito.clearInvocations(actions);
        service.submitForSecondCheck("APP-1", UNDERWRITER);
        assertThat(capture().action()).isEqualTo("second_check");
    }

    @Test
    void notesMapToTheSameActionsAsTheWorker() {
        UnderwritingNote note = new UnderwritingNote();
        when(actions.run(eq("APP-1"), org.mockito.ArgumentMatchers.any())).thenReturn(new WorkflowActions.Result(app, note));

        assertThat(service.addNote("APP-1", UNDERWRITER, "income", "please explain", "CLARIFICATION_REQUEST")).isSameAs(note);
        ArgumentCaptor<Run> run = ArgumentCaptor.forClass(Run.class);
        verify(actions).run(eq("APP-1"), run.capture());
        assertThat(run.getValue().action()).isEqualTo("request_clarification");
        assertThat(run.getValue().input()).containsEntry("section", "income").containsEntry("text", "please explain").containsEntry("noteType", "CLARIFICATION_REQUEST");

        for (String[] pair : new String[][]{{"DOCUMENT_REQUEST", "request_documents"}, {"NOTE", "add_note"}, {"ANYTHING", "add_note"}}) {
            org.mockito.Mockito.clearInvocations(actions);
            service.addNote("APP-1", UNDERWRITER, "s", "t", pair[0]);
            ArgumentCaptor<Run> r = ArgumentCaptor.forClass(Run.class);
            verify(actions).run(eq("APP-1"), r.capture());
            assertThat(r.getValue().action()).as(pair[0]).isEqualTo(pair[1]);
        }
    }

    @Test
    void theRequestsIdempotencyKeyTravelsWithTheAction() {
        returns();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Idempotency-Key", "  retry-me-1  ");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        service.declineApplication("APP-1", UNDERWRITER, "r");
        assertThat(capture().idempotencyKey()).isEqualTo("retry-me-1");
    }

    @Test
    void noHeaderMeansNoKeyHere() {
        returns();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
        service.declineApplication("APP-1", UNDERWRITER, "r");
        assertThat(capture().idempotencyKey()).isNull();
    }

    @Test
    void aCustomerIsACustomerActorWithTheirIdAndEmailFallbackName() {
        AuthenticatedUser customer = new AuthenticatedUser("c-1", 7L, "CUSTOMER", null, Set.of(), null, null, null, null, "noa@x.test");
        WorkflowActor a = WorkflowActor.of(customer);
        assertThat(a.type()).isEqualTo("CUSTOMER");
        assertThat(a.userId()).isEqualTo(7L);
        assertThat(a.name()).isEqualTo("noa@x.test");
        assertThat(a.scope()).isEqualTo("ALL");
        AuthenticatedUser nameless = new AuthenticatedUser("c-2", null, "CUSTOMER", " ", Set.of(), null, null, null, null, null);
        assertThat(WorkflowActor.of(nameless).name()).isEqualTo("CUSTOMER");
        assertThat(WorkflowActor.of(nameless).userId()).isZero();
    }
}
