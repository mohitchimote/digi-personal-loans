package com.digibank.application.workflow;

import com.digibank.application.audittrail.AuditTrailService;
import com.digibank.application.cardpayment.CardPaymentPort;
import com.digibank.application.client.WorkflowClient;
import com.digibank.application.compliance.ComplianceAuditWriter;
import com.digibank.application.config.ApiException;
import com.digibank.application.formbuilder.FormVersion;
import com.digibank.application.formbuilder.FormVersionService;
import com.digibank.application.model.CaseReferral;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.model.ProcessedCommand;
import com.digibank.application.model.UnderwritingNote;
import com.digibank.application.repository.CaseReferralRepository;
import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.repository.ProcessedCommandRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Runs one workflow action on a case end to end: the host half of the engine in workflow-service, the port of the
 * Worker's lib/workflow/host.ts runAction. Every legacy per-action route (decline, submit, withdraw ...) and the
 * generic POST /api/workflow/cases/{ref}/actions/{action} come through here, so they cannot diverge.
 *
 * <h3>Order of work, and what a failure at each step leaves behind</h3>
 * The application's data and workflow-service's state live in two databases, so one atomic commit is not
 * available. The order is chosen so that every failure we can detect leaves them in step:
 * <ol>
 *   <li>Open the application transaction and lock the case's row (concurrent actions on one case queue up here).</li>
 *   <li><b>Dry run</b>: evaluate with {@code commit:false}. A refusal (guard, mandate, referral lock, wrong stage) becomes the
 *       HTTP error the Worker gives; nothing was written anywhere. workflow-service down or timed out: 503, nothing written.</li>
 *   <li>Write everything the action does to the application, still inside the open transaction and flushed: the
 *       caller's own data change, the status mirror, field updates, notes, referral rows, card payment, form-version pin.</li>
 *   <li><b>Commit to workflow-service</b> ({@code commit:true}, same idempotency key) as the last step before the application
 *       transaction commits. If that call fails (retried once, safe because of the key) or the engine now refuses, the application
 *       transaction rolls back: neither side changed, the user gets 503 or the refusal.</li>
 *   <li>Commit the application transaction.</li>
 *   <li>Only then the effects that leave the service: compliance audit rows, notifications, emails, documents, and (after
 *       select_product) auto-approval. They are best effort: a failure is logged and the action still succeeds, as in the Worker,
 *       because the state change cannot be undone.</li>
 * </ol>
 * The one window left is a crash or database failure between steps 4 and 5 (a single COMMIT statement) or a lost response to the
 * commit call that the retry also loses: workflow-service then holds the new state and the application does not. The idempotency
 * key closes it: a retry of the same request replays workflow-service's first answer ({@code replayed:true}) and the application
 * side is applied then. The key comes from the request's Idempotency-Key header, else it is generated per request (so the
 * in-request retry is covered but a user's blind retry is not). A local record of applied keys ({@link ProcessedCommand}, written in
 * the same transaction as the effects) makes a retry of an already-applied request a no-op rather than a duplicate.
 */
@Service
public class WorkflowActions {

    private static final Logger log = LoggerFactory.getLogger(WorkflowActions.class);

    /** One request to run an action. {@code apply} changes the application's own data in the same transaction (a form section, the chosen product). */
    public record Run(String action, WorkflowActor actor, Map<String, Object> input, Consumer<LoanApplication> apply, String idempotencyKey) {
        public static Run of(String action, WorkflowActor actor) { return new Run(action, actor, Map.of(), null, null); }
        public Run withInput(Map<String, Object> input) { return new Run(action, actor, input, apply, idempotencyKey); }
        public Run withApply(Consumer<LoanApplication> apply) { return new Run(action, actor, input, apply, idempotencyKey); }
        public Run withKey(String key) { return new Run(action, actor, input, apply, key); }
    }

    /** The case as it is after the action, and the last note the action recorded (null if none). */
    public record Result(LoanApplication application, UnderwritingNote note) {}

    private record Pending(List<Runnable> afterCommit, UnderwritingNote note) {}

    private final LoanApplicationRepository repository;
    private final CaseReferralRepository referrals;
    private final ProcessedCommandRepository processed;
    private final AuditTrailService auditTrail;
    private final ComplianceAuditWriter compliance;
    private final CardPaymentPort cardPayment;
    private final FormVersionService formVersions;
    private final WorkflowClient workflow;
    private final CaseSummaries summaries;
    private final CustomerMessages messages;
    private final AutoApprovalPolicy autoApproval;
    private final ObjectMapper mapper;
    private final TransactionTemplate tx;

    public WorkflowActions(LoanApplicationRepository repository, CaseReferralRepository referrals, ProcessedCommandRepository processed,
                           AuditTrailService auditTrail, ComplianceAuditWriter compliance, CardPaymentPort cardPayment,
                           FormVersionService formVersions, WorkflowClient workflow, CaseSummaries summaries, CustomerMessages messages,
                           AutoApprovalPolicy autoApproval, ObjectMapper mapper, PlatformTransactionManager txManager) {
        this.repository = repository;
        this.referrals = referrals;
        this.processed = processed;
        this.auditTrail = auditTrail;
        this.compliance = compliance;
        this.cardPayment = cardPayment;
        this.formVersions = formVersions;
        this.workflow = workflow;
        this.summaries = summaries;
        this.messages = messages;
        this.autoApproval = autoApproval;
        this.mapper = mapper;
        this.tx = new TransactionTemplate(txManager);
    }

    public Result run(String applicationRef, Run run) {
        String key = run.idempotencyKey() != null ? run.idempotencyKey() : UUID.randomUUID().toString();
        boolean clientKey = run.idempotencyKey() != null;
        Pending pending = tx.execute(status -> inTransaction(applicationRef, run, key, clientKey));
        for (Runnable effect : pending.afterCommit()) {
            try {
                effect.run();
            } catch (RuntimeException e) {
                log.warn("A post-commit effect of {} on {} failed (the action itself committed): {}", run.action(), applicationRef, e.getMessage());
            }
        }
        return new Result(find(applicationRef), pending.note());
    }

    private LoanApplication find(String ref) {
        return repository.findByApplicationRef(ref).orElseThrow(() -> new IllegalArgumentException("Application not found: " + ref));
    }

    private Pending inTransaction(String ref, Run run, String key, boolean clientKey) {
        LoanApplication app = repository.findForUpdateByApplicationRef(ref).orElseThrow(() -> new IllegalArgumentException("Application not found: " + ref));

        if (clientKey) {
            ProcessedCommand prior = processed.findById(key).orElse(null);
            if (prior != null) {
                if (!prior.getApplicationRef().equals(ref)) throw new ApiException(409, "Idempotency key already used for another case.");
                return new Pending(List.of(), null); // already applied: answer with the case as it is
            }
        }

        EvaluateRequest dryRun = new EvaluateRequest(run.action(), run.actor(), run.input(), summaries.fieldsOf(app), false, key);
        Evaluation e = evaluate(app, dryRun);
        if (!e.ok()) throw new ApiException(e.status(), e.message());

        // ---- the application half, in this transaction ----
        if (run.apply() != null) run.apply().accept(app);
        if (e.mirror().containsKey("status")) app.setStatus((String) e.mirror().get("status"));
        if (e.mirror().containsKey("disbursementStatus")) app.setDisbursementStatus((String) e.mirror().get("disbursementStatus"));
        e.fieldUpdates().forEach((field, value) -> setField(app, field, value));

        List<Runnable> after = new ArrayList<>();
        // Every action emits its event; the compliance trail uses the event's name (host.ts persist()).
        if (Boolean.TRUE.equals(e.audit().get("write"))) {
            Map<String, Object> a = e.audit();
            after.add(() -> compliance.record((String) a.get("eventType"), "LoanApplication", ref, (String) a.get("actor"), (String) a.get("actorRole"), (String) a.get("detail")));
        }
        UnderwritingNote lastNote = null;
        for (Map<String, Object> effect : e.hostEffects()) {
            String type = String.valueOf(effect.get("type"));
            switch (type) {
                case "NOTE" -> {
                    String section = effect.get("section") == null ? "general" : String.valueOf(effect.get("section"));
                    String text = effect.get("text") == null ? "" : String.valueOf(effect.get("text"));
                    String noteType = effect.get("noteType") == null ? "NOTE" : String.valueOf(effect.get("noteType"));
                    String by = run.actor().name();
                    lastNote = auditTrail.saveNote(ref, section, text, noteType, by);
                    after.add(() -> compliance.record(noteType, "LoanApplication", ref, by, text)); // Open Point #19: every decision is audited through its note
                }
                case "NOTIFY" -> after.add(() -> messages.notify(String.valueOf(effect.get("template")), find(ref), vars(effect)));
                case "EMAIL" -> after.add(() -> messages.email(String.valueOf(effect.get("event")), find(ref), vars(effect)));
                case "GENERATE_DOC" -> after.add(() -> messages.generateApprovalLetter(find(ref)));
                case "CARD_PAYMENT" -> authoriseCardPayment(app);
                case "PIN_FORM_VERSION" -> app.setFormVersionId(formVersions.resolveActive(app).map(FormVersion::getId).orElse(null));
                case "UNPIN_FORM_VERSION" -> app.setFormVersionId(null);
                case "RUN_AUTO_APPROVAL" -> after.add(() -> runAutoApproval(ref));
                default -> log.warn("Unknown host effect {} on {} ignored", type, ref);
            }
        }
        if (e.referralClose()) {
            String now = CaseSummaries.iso(LocalDateTime.now());
            for (CaseReferral open : referrals.findByApplicationRefAndResolvedAtIsNull(ref)) {
                open.setResolvedAt(now);
                referrals.save(open);
            }
        }
        if (e.referralOpenToRole() != null) {
            CaseReferral r = new CaseReferral();
            r.setApplicationRef(ref);
            r.setFromRole(run.actor().role() != null ? run.actor().role() : "SYSTEM");
            r.setFromUserId(run.actor().userId());
            r.setFromName(run.actor().name());
            r.setToRole(e.referralOpenToRole());
            r.setReason((String) e.log().get("reason"));
            r.setCreatedAt(CaseSummaries.iso(LocalDateTime.now()));
            referrals.save(r);
        }
        processed.save(new ProcessedCommand(key, ref, run.action()));
        repository.saveAndFlush(app);

        // ---- the workflow half: last step before the application transaction commits ----
        Evaluation done = commit(ref, dryRun.withCommit(true));
        if (!done.ok()) throw new ApiException(done.status(), done.message());
        if (!Objects.equals(e.event(), done.event()) || !Objects.equals(e.to().get("status"), done.to().get("status"))) {
            throw new ApiException(409, "The case changed while the action was running. Try again.");
        }
        return new Pending(after, lastNote);
    }

    /** Evaluates; a case workflow-service has not seen yet (created before the strangler, or while it was down) is registered first. */
    private Evaluation evaluate(LoanApplication app, EvaluateRequest request) {
        Evaluation e = workflow.evaluate(app.getApplicationRef(), request);
        if (!e.ok() && "CASE_NOT_REGISTERED".equals(e.code())) {
            workflow.register(app.getApplicationRef(), summaries.registrationOf(app));
            e = workflow.evaluate(app.getApplicationRef(), request);
        }
        return e;
    }

    /** The commit call, tried twice: the idempotency key makes a repeat harmless if the first one did commit but its answer was lost. */
    private Evaluation commit(String ref, EvaluateRequest request) {
        try {
            return workflow.evaluate(ref, request);
        } catch (WorkflowUnavailableException first) {
            log.warn("Commit of {} on {} did not get an answer; retrying once with the same idempotency key", request.action(), ref);
            return workflow.evaluate(ref, request);
        }
    }

    private static Map<String, Object> vars(Map<String, Object> effect) {
        return effect.get("vars") instanceof Map<?, ?> m ? castMap(m) : Map.of();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Map<?, ?> m) {
        return (Map<String, Object>) m;
    }

    /** N1: generate once, then persist: a repeat call never regenerates the synthetic transaction. Never blocks the action. */
    private void authoriseCardPayment(LoanApplication app) {
        if (app.getCardPaymentResultJson() != null) return;
        try {
            app.setCardPaymentResultJson(mapper.writeValueAsString(cardPayment.authorise(app, app.getApprovedAmount())));
        } catch (Exception e) {
            log.warn("Card payment simulation failed for {} (non-fatal): {}", app.getApplicationRef(), e.getMessage());
        }
    }

    /** Auto-approval is a convenience; a failure leaves the case with the underwriters. */
    private void runAutoApproval(String ref) {
        try {
            policyDecision(ref).ifPresent(amount -> run(ref, new Run("auto_approve", WorkflowActor.SYSTEM_AUTO_APPROVAL,
                    Map.of("approvedAmount", amount), null, null)));
        } catch (RuntimeException e) {
            log.warn("Auto-approval of {} failed (non-fatal): {}", ref, e.getMessage());
        }
    }

    private java.util.Optional<BigDecimal> policyDecision(String ref) {
        return autoApproval.approvedAmountFor(find(ref));
    }

    private static BigDecimal amount(Object v) {
        if (v instanceof BigDecimal b) return b;
        if (v instanceof Integer || v instanceof Long) return BigDecimal.valueOf(((Number) v).longValue());
        BigDecimal b = new BigDecimal(String.valueOf(v));
        return b.stripTrailingZeros().scale() <= 0 ? b.setScale(0, java.math.RoundingMode.UNNECESSARY) : b;
    }

    /** The fields the engine may write on the application; anything else a definition names is ignored (host.ts WRITABLE_FIELDS). */
    static void setField(LoanApplication app, String field, Object v) {
        switch (field) {
            case "submittedAt" -> app.setSubmittedAt(v == null ? null : CaseSummaries.parseIso(v));
            case "completionPercentage" -> app.setCompletionPercentage(v instanceof Number n ? n.intValue() : null);
            case "approvedAmount" -> app.setApprovedAmount(v == null ? null : amount(v));
            case "autoApproved" -> app.setAutoApproved(Boolean.TRUE.equals(v));
            case "referredToRole" -> app.setReferredToRole(v == null ? null : String.valueOf(v));
            case "guarantorRequired" -> app.setGuarantorRequired(Boolean.TRUE.equals(v));
            case "currentSection" -> app.setCurrentSection(v == null ? null : String.valueOf(v));
            default -> { }
        }
    }
}
