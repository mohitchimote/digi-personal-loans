package com.digibank.application.workflow;

import com.digibank.application.audittrail.AuditTrailService;
import com.digibank.application.cardpayment.CardPaymentPort;
import com.digibank.application.cardpayment.dto.CardPaymentResult;
import com.digibank.application.compliance.ComplianceAuditWriter;
import com.digibank.application.config.ApiException;
import com.digibank.application.formbuilder.AppDbTest;
import com.digibank.application.formbuilder.FormVersion;
import com.digibank.application.formbuilder.FormVersionService;
import com.digibank.application.model.CaseReferral;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.CaseReferralRepository;
import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.repository.ProcessedCommandRepository;
import com.digibank.application.repository.UnderwritingNoteRepository;
import com.digibank.application.workflow.WorkflowActions.Run;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import static com.digibank.application.workflow.FakeWorkflowClient.effect;
import static com.digibank.application.workflow.FakeWorkflowClient.success;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * WorkflowActions against a real (H2) database, repositories and transactions, with a scripted workflow-service.
 * Not wrapped in a test transaction: each action's own transaction really commits or rolls back, which is the point.
 * Covers the order of work (dry run, local writes, commit to workflow-service last), refusals, 503s, rollback, idempotent
 * replay, lazy registration, every host effect, referral rows and auto-approval.
 */
@AppDbTest
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class WorkflowActionsDbTest {

    static final WorkflowActor STAFF = new WorkflowActor("STAFF", 50, "Staff 50", "UNDERWRITER", 1, Set.of("case.decline"), "ALL", null);

    @Autowired LoanApplicationRepository apps;
    @Autowired CaseReferralRepository referrals;
    @Autowired ProcessedCommandRepository processed;
    @Autowired UnderwritingNoteRepository notes;
    @Autowired PlatformTransactionManager tm;
    @Autowired JdbcTemplate jdbc;

    final FakeWorkflowClient wf = new FakeWorkflowClient();
    final ComplianceAuditWriter compliance = mock(ComplianceAuditWriter.class);
    final CardPaymentPort card = mock(CardPaymentPort.class);
    final FormVersionService forms = mock(FormVersionService.class);
    final CustomerMessages messages = mock(CustomerMessages.class);
    final AutoApprovalPolicy policy = mock(AutoApprovalPolicy.class);
    WorkflowActions actions;

    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        actions = new WorkflowActions(apps, referrals, processed, new AuditTrailService(notes), compliance, card, forms, wf,
                new CaseSummaries(mapper), messages, policy, mapper, tm);
        apps.save(app("APP-1", "UNDER_REVIEW"));
    }

    @AfterEach
    void clean() {
        notes.deleteAll();
        referrals.deleteAll();
        processed.deleteAll();
        apps.deleteAll();
    }

    private static LoanApplication app(String ref, String status) {
        LoanApplication a = LoanApplication.builder().applicationRef(ref).customerId(7L).customerEmail("c@x.test").status(status)
                .applicationType("PERSONAL").currentSection("reviewSubmit").completionPercentage(100).build();
        return a;
    }

    private LoanApplication reload(String ref) {
        return apps.findByApplicationRef(ref).orElseThrow();
    }

    private static Map<String, Object> fields(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private Run decline(String key) {
        return Run.of("decline", STAFF).withInput(Map.of("reason", "too risky")).withKey(key);
    }

    private static final List<Map<String, Object>> DECLINE_EFFECTS = List.of(
            effect("NOTE", "noteType", "DECISION_DECLINED", "section", "general", "text", "too risky"),
            effect("NOTIFY", "template", "DECISION_DECLINED", "vars", Map.of("reason", "too risky")),
            effect("EMAIL", "event", "DECISION_DECLINED", "vars", Map.of("declineReason", "too risky", "reviewedBy", "Staff 50")));

    private void declineEngine() {
        wf.engine = (r, n) -> success("decline", "case.declined", "DECLINED", fields("referredToRole", null), DECLINE_EFFECTS);
    }

    // ---- the happy path ----------------------------------------------------------------------------

    @Test
    void anAllowedActionWritesTheCaseTheNoteAndTheMirrorThenCommitsToWorkflowServiceLast() {
        AtomicReference<String> statusSeenAtCommit = new AtomicReference<>();
        wf.engine = (r, n) -> {
            if (r.commit()) statusSeenAtCommit.set(jdbc.queryForObject("select status from loan_applications where application_ref = 'APP-1'", String.class));
            return success("decline", "case.declined", "DECLINED", fields("referredToRole", null), DECLINE_EFFECTS);
        };

        WorkflowActions.Result r = actions.run("APP-1", decline("key-1"));

        assertThat(wf.calls).containsExactly("evaluate:decline:dry", "evaluate:decline:commit");
        assertThat(wf.evaluations.get(0).commit()).isFalse();
        assertThat(wf.evaluations.get(1).commit()).isTrue();
        assertThat(wf.evaluations.get(1).idempotencyKey()).isEqualTo("key-1").isEqualTo(wf.evaluations.get(0).idempotencyKey());
        // the application's own write was already in the open transaction when workflow-service was asked to commit
        assertThat(statusSeenAtCommit.get()).isEqualTo("DECLINED");

        assertThat(r.application().getStatus()).isEqualTo("DECLINED");
        assertThat(reload("APP-1").getStatus()).isEqualTo("DECLINED");
        assertThat(notes.findByApplicationRefOrderByCreatedAtDesc("APP-1")).singleElement().satisfies(n -> {
            assertThat(n.getNoteType()).isEqualTo("DECISION_DECLINED");
            assertThat(n.getNote()).isEqualTo("too risky");
            assertThat(n.getCreatedBy()).isEqualTo("Staff 50");
            assertThat(n.getSection()).isEqualTo("general");
        });
        assertThat(r.note()).isNotNull();
        assertThat(processed.existsById("key-1")).isTrue();
    }

    @Test
    void theEngineSeesTheApplicationAsItIsNowNotAsOfTheLastSummaryUpdate() {
        LoanApplication a = reload("APP-1");
        a.setReferredToRole("HEAD_OF_LENDING");
        a.setApprovedAmount(new BigDecimal("1500"));
        a.setGuarantorRequired(true);
        a.setGuarantorDetailsJson("{}");
        apps.save(a);
        declineEngine();

        actions.run("APP-1", decline(null));

        Map<String, Object> f = wf.evaluations.get(0).fields();
        assertThat(f).containsEntry("referredToRole", "HEAD_OF_LENDING").containsEntry("approvedAmount", 1500.0)
                .containsEntry("guarantorRequired", true).containsEntry("guarantorDetailsPresent", true).containsEntry("currentSection", "reviewSubmit");
        assertThat(wf.evaluations.get(0).actor()).isEqualTo(STAFF);
        assertThat(wf.evaluations.get(0).input()).containsEntry("reason", "too risky");
    }

    @Test
    void everyEffectThatLeavesTheServiceRunsOnlyAfterTheActionHasCommitted() {
        declineEngine();
        // while workflow-service is asked to commit nothing may have gone out yet
        wf.engine = (r, n) -> {
            if (r.commit()) verifyNoInteractions(messages, compliance);
            return success("decline", "case.declined", "DECLINED", fields("referredToRole", null), DECLINE_EFFECTS);
        };

        actions.run("APP-1", decline(null));

        verify(compliance).record(eq("case.declined"), eq("LoanApplication"), eq("APP-1"), eq("Staff 50"), eq("UNDERWRITER"), anyString());
        verify(compliance).record("DECISION_DECLINED", "LoanApplication", "APP-1", "Staff 50", "too risky");
        verify(messages).notify(eq("DECISION_DECLINED"), any(LoanApplication.class), eq(Map.of("reason", "too risky")));
        verify(messages).email(eq("DECISION_DECLINED"), any(LoanApplication.class), eq(Map.of("declineReason", "too risky", "reviewedBy", "Staff 50")));
    }

    @Test
    void aFailingPostCommitEffectIsLoggedAndTheActionStillSucceeds() {
        declineEngine();
        doThrow(new IllegalStateException("smtp down")).when(messages).email(anyString(), any(), any());

        WorkflowActions.Result r = actions.run("APP-1", decline(null));

        assertThat(r.application().getStatus()).isEqualTo("DECLINED");
        verify(messages).notify(anyString(), any(), any());
    }

    // ---- refusals ----------------------------------------------------------------------------------

    @Test
    void anEngineRefusalBecomesTheHttpErrorAndNothingIsWrittenOrCommitted() {
        wf.engine = (r, n) -> Evaluation.refusal(403, "OVER_MANDATE", "Amount (900000) exceeds your mandate limit (100000) for this case.");
        AtomicReference<Boolean> applied = new AtomicReference<>(false);

        assertThatThrownBy(() -> actions.run("APP-1", decline("k").withApply(a -> { applied.set(true); a.setSelectedProductId("P9"); })))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(403);
                    assertThat(e.getMessage()).startsWith("Amount (900000) exceeds your mandate limit");
                });

        assertThat(wf.calls).containsExactly("evaluate:decline:dry");
        assertThat(applied.get()).as("the caller's data change is not applied for a refused action").isFalse();
        assertThat(reload("APP-1").getStatus()).isEqualTo("UNDER_REVIEW");
        assertThat(notes.count()).isZero();
        assertThat(processed.count()).isZero();
        verifyNoInteractions(messages, compliance);
    }

    @Test
    void everyRefusalStatusIsPassedThrough() {
        for (int status : List.of(400, 403, 404, 409)) {
            wf.engine = (r, n) -> Evaluation.refusal(status, "X", "refused " + status);
            assertThatThrownBy(() -> actions.run("APP-1", decline(null))).isInstanceOfSatisfying(ApiException.class,
                    e -> assertThat(e.getStatus()).isEqualTo(status));
        }
    }

    @Test
    void anUnknownApplicationIsThe400TheLegacyRoutesGave() {
        assertThatThrownBy(() -> actions.run("NOPE", decline(null))).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Application not found: NOPE");
        assertThat(wf.calls).isEmpty();
    }

    // ---- workflow-service cannot answer ------------------------------------------------------------

    @Test
    void whenWorkflowServiceIsDownTheActionFailsWith503AndNothingIsApplied() {
        wf.failEverything = new WorkflowUnavailableException(new RuntimeException("connection refused"));

        assertThatThrownBy(() -> actions.run("APP-1", decline("k"))).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(503);
            assertThat(e.getMessage()).isEqualTo("A service this action depends on is unavailable. Try again shortly.");
        });

        assertThat(reload("APP-1").getStatus()).isEqualTo("UNDER_REVIEW");
        assertThat(notes.count()).isZero();
        assertThat(processed.count()).isZero();
        verifyNoInteractions(messages, compliance);
    }

    @Test
    void ifTheCommitCallFailsTwiceTheWholeApplicationTransactionRollsBack() {
        wf.engine = (r, n) -> {
            if (r.commit()) throw new WorkflowUnavailableException(null);
            return success("decline", "case.declined", "DECLINED", fields("referredToRole", null), DECLINE_EFFECTS);
        };

        assertThatThrownBy(() -> actions.run("APP-1", decline("k").withApply(a -> a.setSelectedProductId("P9"))))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getStatus()).isEqualTo(503));

        assertThat(wf.commitCalls()).as("the commit is retried once").isEqualTo(2);
        assertThat(wf.evaluations.stream().filter(EvaluateRequest::commit).map(EvaluateRequest::idempotencyKey).distinct()).containsExactly("k");
        LoanApplication after = reload("APP-1");
        assertThat(after.getStatus()).isEqualTo("UNDER_REVIEW");
        assertThat(after.getSelectedProductId()).isNull();
        assertThat(notes.count()).isZero();
        assertThat(processed.count()).as("a rolled back action is not recorded as applied").isZero();
        verifyNoInteractions(messages, compliance);
    }

    @Test
    void aCommitThatFailsOnceAndThenAnswersSucceeds() {
        wf.engine = (r, n) -> {
            if (r.commit() && n == 1) throw new WorkflowUnavailableException(null);
            return success("decline", "case.declined", "DECLINED", fields("referredToRole", null), DECLINE_EFFECTS);
        };

        assertThat(actions.run("APP-1", decline("k")).application().getStatus()).isEqualTo("DECLINED");
        assertThat(wf.commitCalls()).isEqualTo(2);
        assertThat(notes.count()).isEqualTo(1);
    }

    @Test
    void ifTheEngineRefusesAtCommitTimeBecauseTheCaseMovedTheApplicationRollsBack() {
        wf.engine = (r, n) -> r.commit()
                ? Evaluation.refusal(403, "REFERRAL_LOCKED", "This case has been referred to COO and can only be actioned at that level or above.")
                : success("decline", "case.declined", "DECLINED", fields("referredToRole", null), DECLINE_EFFECTS);

        assertThatThrownBy(() -> actions.run("APP-1", decline("k"))).isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getStatus()).isEqualTo(403));

        assertThat(reload("APP-1").getStatus()).isEqualTo("UNDER_REVIEW");
        assertThat(notes.count()).isZero();
        assertThat(processed.count()).isZero();
    }

    @Test
    void ifTheCommitWouldHaveDoneSomethingElseThanTheDryRunTheApplicationRollsBack() {
        wf.engine = (r, n) -> r.commit()
                ? success("decline", "case.declined", "WITHDRAWN", fields(), List.of())
                : success("decline", "case.declined", "DECLINED", fields("referredToRole", null), DECLINE_EFFECTS);

        assertThatThrownBy(() -> actions.run("APP-1", decline("k"))).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getMessage()).isEqualTo("The case changed while the action was running. Try again.");
        });
        assertThat(reload("APP-1").getStatus()).isEqualTo("UNDER_REVIEW");
        assertThat(notes.count()).isZero();
    }

    // ---- idempotency -------------------------------------------------------------------------------

    @Test
    void retryingARequestThatWasAlreadyAppliedChangesNothingAndMakesNoCalls() {
        declineEngine();
        actions.run("APP-1", decline("same-key"));
        int calls = wf.calls.size();
        reset(messages, compliance);

        WorkflowActions.Result again = actions.run("APP-1", decline("same-key"));

        assertThat(wf.calls).as("no call to workflow-service").hasSize(calls);
        assertThat(notes.count()).as("no second note").isEqualTo(1);
        assertThat(again.application().getStatus()).isEqualTo("DECLINED");
        assertThat(again.note()).isNull();
        verifyNoInteractions(messages, compliance);
    }

    @Test
    void aKeyAlreadyUsedForAnotherCaseIsRefused() {
        apps.save(app("APP-2", "UNDER_REVIEW"));
        declineEngine();
        actions.run("APP-1", decline("shared-key"));

        assertThatThrownBy(() -> actions.run("APP-2", decline("shared-key"))).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getMessage()).isEqualTo("Idempotency key already used for another case.");
        });
        assertThat(reload("APP-2").getStatus()).isEqualTo("UNDER_REVIEW");
    }

    @Test
    void whenWorkflowServiceAlreadyCommittedAndTheApplicationDidNotTheRetryAppliesTheApplicationSide() {
        // workflow-service replays its first answer for the key; this service has no record of the key: it finishes the job
        wf.engine = (r, n) -> FakeWorkflowClient.replayed(success("decline", "case.declined", "DECLINED", fields("referredToRole", null), DECLINE_EFFECTS));

        WorkflowActions.Result r = actions.run("APP-1", decline("healed"));

        assertThat(r.application().getStatus()).isEqualTo("DECLINED");
        assertThat(notes.count()).isEqualTo(1);
        assertThat(processed.existsById("healed")).isTrue();
    }

    @Test
    void aRequestWithoutAKeyGetsOneAndUsesItForBothCalls() {
        declineEngine();
        actions.run("APP-1", decline(null));
        String dry = wf.evaluations.get(0).idempotencyKey();
        assertThat(dry).isNotBlank();
        assertThat(wf.evaluations.get(1).idempotencyKey()).isEqualTo(dry);
    }

    // ---- a case workflow-service has not seen --------------------------------------------------------

    @Test
    void aCaseWorkflowServiceHasNotSeenIsRegisteredWithItsCurrentStatusAndTheActionRetried() {
        wf.engine = (r, n) -> wf.registered.isEmpty()
                ? Evaluation.refusal(404, "CASE_NOT_REGISTERED", "Application not found: APP-1")
                : success("decline", "case.declined", "DECLINED", fields("referredToRole", null), DECLINE_EFFECTS);

        assertThat(actions.run("APP-1", decline(null)).application().getStatus()).isEqualTo("DECLINED");

        assertThat(wf.calls).containsExactly("evaluate:decline:dry", "register:APP-1", "evaluate:decline:dry", "evaluate:decline:commit");
        assertThat(wf.registered.get(0)).containsEntry("status", "UNDER_REVIEW").containsEntry("customerId", 7L).containsEntry("applicationType", "PERSONAL");
    }

    // ---- the caller's data change, mirror columns and field updates -----------------------------------

    @Test
    void theCallersDataChangeIsAppliedInTheSameTransactionAfterTheDryRunPasses() {
        wf.engine = (r, n) -> success("select_product", "case.productSelected", "UNDER_REVIEW", fields(), List.of());

        actions.run("APP-1", Run.of("select_product", STAFF).withApply(a -> { a.setSelectedProductId("P1"); a.setSelectedProductJson("{\"productId\":\"P1\"}"); }));

        LoanApplication a = reload("APP-1");
        assertThat(a.getSelectedProductId()).isEqualTo("P1");
        assertThat(a.getSelectedProductJson()).contains("P1");
    }

    @Test
    void theDisbursementMirrorIsWrittenFromTheAnswerAndClearedWhenItSaysNull() {
        LoanApplication a = reload("APP-1");
        a.setStatus("APPROVED");
        a.setDisbursementStatus("SECOND_CHECK_PENDING");
        apps.save(a);
        Map<String, Object> mirror = new HashMap<>();
        mirror.put("disbursementStatus", "FUNDS_RELEASED");
        wf.engine = (r, n) -> new Evaluation(true, 200, null, null, "authorise", "disbursement.authorised", "disbursement", Map.of(), Map.of("status", "FUNDS_RELEASED"),
                Map.of(), false, null, List.of(), Map.of("reason", ""), mirror, Map.of("write", false), true, false);

        actions.run("APP-1", Run.of("authorise", STAFF));
        assertThat(reload("APP-1").getDisbursementStatus()).isEqualTo("FUNDS_RELEASED");
        assertThat(reload("APP-1").getStatus()).as("the case track is untouched").isEqualTo("APPROVED");

        mirror.put("disbursementStatus", null);
        actions.run("APP-1", Run.of("authorise", STAFF));
        assertThat(reload("APP-1").getDisbursementStatus()).isNull();
        verifyNoInteractions(compliance); // audit.write was false
    }

    @Test
    void fieldUpdatesAreWrittenAndFieldsOutsideTheWritableSetAreIgnored() {
        wf.engine = (r, n) -> success("approve", "case.approved", "APPROVED",
                fields("approvedAmount", 50000, "autoApproved", false, "referredToRole", null, "currentSection", "reviewSubmit",
                        "completionPercentage", 100, "guarantorRequired", true, "submittedAt", "2026-11-11T10:15:30.123Z", "customerEmail", "evil@x.test", "status", "DECLINED"),
                List.of());

        actions.run("APP-1", Run.of("approve", STAFF).withInput(Map.of("approvedAmount", 50000)));

        LoanApplication a = reload("APP-1");
        assertThat(a.getApprovedAmount()).isEqualByComparingTo("50000");
        assertThat(a.getAutoApproved()).isFalse();
        assertThat(a.getGuarantorRequired()).isTrue();
        assertThat(a.getCompletionPercentage()).isEqualTo(100);
        assertThat(a.getSubmittedAt()).isNotNull();
        assertThat(a.getCustomerEmail()).isEqualTo("c@x.test");
        assertThat(a.getStatus()).as("only the mirror writes status").isEqualTo("APPROVED");
    }

    @Test
    void aDecimalApprovedAmountKeepsItsValue() {
        wf.engine = (r, n) -> success("approve", "case.approved", "APPROVED", fields("approvedAmount", 12345.5), List.of());
        actions.run("APP-1", Run.of("approve", STAFF));
        assertThat(reload("APP-1").getApprovedAmount()).isEqualByComparingTo("12345.5");
    }

    // ---- referrals ---------------------------------------------------------------------------------

    @Test
    void referringClosesTheOpenReferralAndOpensTheNewOneFromTheActor() {
        CaseReferral open = new CaseReferral();
        open.setApplicationRef("APP-1");
        open.setFromRole("BANKER");
        open.setFromUserId(3L);
        open.setFromName("Bea");
        open.setToRole("UNDERWRITER");
        open.setCreatedAt("2026-11-01T00:00:00.000Z");
        referrals.save(open);
        wf.engine = (r, n) -> FakeWorkflowClient.withReferral(success("refer", "case.referred", "REFERRED_TO_SENIOR", fields("referredToRole", "SENIOR_UNDERWRITER"), List.of()),
                true, "SENIOR_UNDERWRITER");

        actions.run("APP-1", Run.of("refer", STAFF).withInput(Map.of("reason", "big one")));

        List<CaseReferral> rows = referrals.findByApplicationRefOrderByCreatedAtAsc("APP-1");
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).getResolvedAt()).as("the previous referral is closed").isNotNull();
        CaseReferral fresh = rows.get(1);
        assertThat(fresh.getResolvedAt()).isNull();
        assertThat(fresh.getToRole()).isEqualTo("SENIOR_UNDERWRITER");
        assertThat(fresh.getFromRole()).isEqualTo("UNDERWRITER");
        assertThat(fresh.getFromUserId()).isEqualTo(50L);
        assertThat(fresh.getFromName()).isEqualTo("Staff 50");
        assertThat(fresh.getReason()).isEqualTo("because");
        assertThat(reload("APP-1").getReferredToRole()).isEqualTo("SENIOR_UNDERWRITER");
    }

    @Test
    void aSystemActorReferralIsFromTheRoleSystem() {
        wf.engine = (r, n) -> FakeWorkflowClient.withReferral(success("refer", "case.referred", "REFERRED_TO_SENIOR", fields(), List.of()), false, "UNDERWRITER");
        actions.run("APP-1", Run.of("refer", WorkflowActor.SYSTEM_AUTO_APPROVAL));
        assertThat(referrals.findByApplicationRefOrderByCreatedAtAsc("APP-1")).singleElement().satisfies(r -> {
            assertThat(r.getFromRole()).isEqualTo("SYSTEM");
            assertThat(r.getFromUserId()).isZero();
        });
    }

    @Test
    void aRolledBackActionLeavesTheReferralRowsAlone() {
        CaseReferral open = new CaseReferral();
        open.setApplicationRef("APP-1");
        open.setFromRole("BANKER");
        open.setFromUserId(3L);
        open.setFromName("Bea");
        open.setToRole("UNDERWRITER");
        open.setCreatedAt("2026-11-01T00:00:00.000Z");
        referrals.save(open);
        wf.engine = (r, n) -> {
            if (r.commit()) throw new WorkflowUnavailableException(null);
            return FakeWorkflowClient.withReferral(success("refer", "case.referred", "REFERRED_TO_SENIOR", fields(), List.of()), true, "SENIOR_UNDERWRITER");
        };
        assertThatThrownBy(() -> actions.run("APP-1", Run.of("refer", STAFF))).isInstanceOf(ApiException.class);
        List<CaseReferral> rows = referrals.findByApplicationRefOrderByCreatedAtAsc("APP-1");
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getResolvedAt()).isNull();
    }

    // ---- the other host effects --------------------------------------------------------------------

    @Test
    void cardPaymentIsGeneratedOnceAndKept() {
        CardPaymentResult result = new CardPaymentResult();
        result.setTransactionId("TX-1");
        when(card.authorise(any(), any())).thenReturn(result);
        wf.engine = (r, n) -> success("authorise", "disbursement.authorised", null, fields(), List.of(effect("CARD_PAYMENT", "mode", "AUTHORISE")));

        actions.run("APP-1", Run.of("authorise", STAFF));
        String first = reload("APP-1").getCardPaymentResultJson();
        assertThat(first).contains("TX-1");

        actions.run("APP-1", Run.of("authorise", STAFF));
        verify(card, times(1)).authorise(any(), any());
        assertThat(reload("APP-1").getCardPaymentResultJson()).isEqualTo(first);
    }

    @Test
    void aFailingCardSimulationNeverBlocksTheAction() {
        when(card.authorise(any(), any())).thenThrow(new IllegalStateException("integration-service down"));
        wf.engine = (r, n) -> success("authorise", "disbursement.authorised", null, fields(), List.of(effect("CARD_PAYMENT", "mode", "AUTHORISE")));
        assertThat(actions.run("APP-1", Run.of("authorise", STAFF)).application().getCardPaymentResultJson()).isNull();
    }

    @Test
    void theFormVersionIsPinnedOnSubmitAndReleasedOnWithdraw() {
        FormVersion v = new FormVersion();
        v.setId(42L);
        when(forms.resolveActive(any())).thenReturn(Optional.of(v));
        wf.engine = (r, n) -> success("submit", "case.submitted", "SUBMITTED", fields(), List.of(effect("PIN_FORM_VERSION")));
        actions.run("APP-1", Run.of("submit", STAFF));
        assertThat(reload("APP-1").getFormVersionId()).isEqualTo(42L);

        wf.engine = (r, n) -> success("withdraw", "case.pulledBack", "IN_PROGRESS", fields(), List.of(effect("UNPIN_FORM_VERSION")));
        actions.run("APP-1", Run.of("withdraw", STAFF));
        assertThat(reload("APP-1").getFormVersionId()).isNull();
    }

    @Test
    void generatingTheApprovalLetterRunsAfterCommitOnTheCaseAsApproved() {
        AtomicReference<String> statusSeen = new AtomicReference<>();
        doAnswer(i -> { statusSeen.set(((LoanApplication) i.getArgument(0)).getStatus()); return null; }).when(messages).generateApprovalLetter(any());
        wf.engine = (r, n) -> success("approve", "case.approved", "APPROVED", fields("approvedAmount", 1000), List.of(effect("GENERATE_DOC", "doc", "APPROVAL_LETTER")));
        actions.run("APP-1", Run.of("approve", STAFF));
        assertThat(statusSeen.get()).isEqualTo("APPROVED");
    }

    @Test
    void anUnknownHostEffectIsIgnoredNotFatal() {
        wf.engine = (r, n) -> success("approve", "case.approved", "APPROVED", fields(), List.of(effect("TELEPORT")));
        assertThat(actions.run("APP-1", Run.of("approve", STAFF)).application().getStatus()).isEqualTo("APPROVED");
    }

    @Test
    void noteEffectDefaultsMatchTheWorker() {
        wf.engine = (r, n) -> success("add_note", "case.noteAdded", null, fields(), List.of(effect("NOTE")));
        actions.run("APP-1", Run.of("add_note", STAFF));
        assertThat(notes.findByApplicationRefOrderByCreatedAtDesc("APP-1")).singleElement().satisfies(n -> {
            assertThat(n.getSection()).isEqualTo("general");
            assertThat(n.getNoteType()).isEqualTo("NOTE");
            assertThat(n.getNote()).isEmpty();
        });
    }

    // ---- auto-approval -----------------------------------------------------------------------------

    @Test
    void selectingAProductThatPassesTheThresholdLetsTheSystemApproveTheCase() {
        when(policy.approvedAmountFor(any())).thenReturn(Optional.of(new BigDecimal("25000")));
        wf.engine = (r, n) -> switch (r.action()) {
            case "select_product" -> success("select_product", "case.productSelected", "UNDER_REVIEW", fields(), List.of(effect("RUN_AUTO_APPROVAL")));
            case "auto_approve" -> success("auto_approve", "case.autoApproved", "APPROVED", fields("approvedAmount", 25000, "autoApproved", true, "referredToRole", null),
                    List.of(effect("NOTE", "noteType", "DECISION_APPROVED", "section", "general", "text", "Application approved.")));
            default -> throw new AssertionError(r.action());
        };

        WorkflowActions.Result r = actions.run("APP-1", Run.of("select_product", STAFF).withKey("outer-key"));

        assertThat(r.application().getStatus()).as("the case returned is already approved, as in the Worker").isEqualTo("APPROVED");
        assertThat(r.application().getAutoApproved()).isTrue();
        assertThat(r.application().getApprovedAmount()).isEqualByComparingTo("25000");
        EvaluateRequest system = wf.evaluations.stream().filter(e -> e.action().equals("auto_approve")).findFirst().orElseThrow();
        assertThat(system.actor()).isEqualTo(WorkflowActor.SYSTEM_AUTO_APPROVAL);
        assertThat(system.input()).containsEntry("approvedAmount", new BigDecimal("25000"));
        assertThat(system.idempotencyKey()).as("the system action never reuses the user's key").isNotEqualTo("outer-key");
        assertThat(notes.findByApplicationRefOrderByCreatedAtDesc("APP-1")).extracting(n -> n.getCreatedBy()).containsExactly("System (Auto-Approval)");
    }

    @Test
    void whenThePolicySaysNoTheCaseStaysWithTheUnderwriters() {
        when(policy.approvedAmountFor(any())).thenReturn(Optional.empty());
        wf.engine = (r, n) -> success("select_product", "case.productSelected", "UNDER_REVIEW", fields(), List.of(effect("RUN_AUTO_APPROVAL")));
        assertThat(actions.run("APP-1", Run.of("select_product", STAFF)).application().getStatus()).isEqualTo("UNDER_REVIEW");
        assertThat(wf.calls).noneMatch(c -> c.contains("auto_approve"));
    }

    @Test
    void aFailureDuringAutoApprovalLeavesTheSelectionIntact() {
        when(policy.approvedAmountFor(any())).thenReturn(Optional.of(new BigDecimal("25000")));
        wf.engine = (r, n) -> {
            if (r.action().equals("auto_approve")) throw new WorkflowUnavailableException(null);
            return success("select_product", "case.productSelected", "UNDER_REVIEW", fields(), List.of(effect("RUN_AUTO_APPROVAL")));
        };
        WorkflowActions.Result r = actions.run("APP-1", Run.of("select_product", STAFF).withApply(a -> a.setSelectedProductId("P1")));
        assertThat(r.application().getStatus()).isEqualTo("UNDER_REVIEW");
        assertThat(r.application().getSelectedProductId()).isEqualTo("P1");
    }
}
