package com.digibank.application.workflow;

import com.digibank.application.client.WorkflowClient;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Keeps workflow-service's copy of each case in step with the application: registers a case when it is created,
 * pushes the summary again when it changes, and backfills every existing application. All idempotent
 * (PUT /internal/workflow/cases/{ref} and POST /internal/workflow/backfill only create what is missing and refresh
 * summaries; they never touch workflow state of a case they already hold).
 *
 * Registering at creation and on summary changes is best effort and runs once the application's own transaction has
 * committed: a case that could not be registered is registered the first time an action is evaluated on it
 * ({@link WorkflowActions}) and by the startup backfill, so a workflow-service outage never blocks starting or
 * saving an application. Executing an action is different: that needs the engine and fails with 503 if it cannot answer.
 */
@Component
public class WorkflowCases {

    private static final Logger log = LoggerFactory.getLogger(WorkflowCases.class);
    static final int BATCH = 200;

    private final WorkflowClient workflow;
    private final CaseSummaries summaries;
    private final LoanApplicationRepository repository;
    private final boolean backfillOnStartup;

    public WorkflowCases(WorkflowClient workflow, CaseSummaries summaries, LoanApplicationRepository repository,
                         @Value("${app.workflow.backfill-on-startup:true}") boolean backfillOnStartup) {
        this.workflow = workflow;
        this.summaries = summaries;
        this.repository = repository;
        this.backfillOnStartup = backfillOnStartup;
    }

    /** Registers (or refreshes the summary of) one case; throws WorkflowUnavailableException when the service cannot answer. */
    public void register(LoanApplication app) {
        workflow.register(app.getApplicationRef(), summaries.registrationOf(app));
    }

    /** Best effort, and only once the surrounding transaction (if any) has committed. */
    public void registerAfterCommit(LoanApplication app) {
        Map<String, Object> body = summaries.registrationOf(app);
        String ref = app.getApplicationRef();
        Runnable push = () -> {
            try {
                workflow.register(ref, body);
            } catch (RuntimeException e) {
                log.warn("Could not register {} with workflow-service (it is registered on first use and by the backfill): {}", ref, e.getMessage());
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { push.run(); }
            });
        } else {
            push.run();
        }
    }

    /** Pushes every application to workflow-service in batches. Safe to run any number of times. */
    public Map<String, Object> backfillAll() {
        int created = 0, updated = 0, pages = 0;
        List<Object> failed = new ArrayList<>();
        Page<LoanApplication> page;
        int index = 0;
        do {
            page = repository.findAll(PageRequest.of(index++, BATCH, Sort.by("id")));
            if (page.isEmpty()) break;
            pages++;
            Map<String, Object> r = workflow.backfill(page.getContent().stream().map(summaries::registrationOf).toList());
            created += r.get("created") instanceof Number n ? n.intValue() : 0;
            updated += r.get("updated") instanceof Number n ? n.intValue() : 0;
            if (r.get("failed") instanceof List<?> f) failed.addAll(f);
        } while (page.hasNext());
        return Map.of("created", created, "updated", updated, "failed", failed, "batches", pages);
    }

    /** Startup backfill, off the startup thread so a slow or absent workflow-service never delays or fails the boot. */
    @EventListener(ApplicationReadyEvent.class)
    public void backfillOnStartup() {
        if (!backfillOnStartup) return;
        Thread t = new Thread(() -> {
            try {
                Map<String, Object> r = backfillAll();
                log.info("workflow-service backfill: {}", r);
            } catch (RuntimeException e) {
                log.warn("workflow-service backfill skipped (run POST /api/applications/admin/workflow-backfill once it is up): {}", e.getMessage());
            }
        }, "workflow-backfill");
        t.setDaemon(true);
        t.start();
    }
}
