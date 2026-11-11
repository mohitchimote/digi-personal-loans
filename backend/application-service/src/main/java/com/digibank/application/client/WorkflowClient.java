package com.digibank.application.client;

import com.digibank.application.workflow.EvaluateRequest;
import com.digibank.application.workflow.Evaluation;
import com.digibank.application.workflow.QueueSettings;
import com.digibank.application.workflow.WorkflowActor;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * application-service's view of workflow-service's internal API (backend/workflow-service/README.md). Every
 * method throws WorkflowUnavailableException (HTTP 503) when the service cannot answer, and an ApiException
 * carrying workflow-service's own status for a 4xx. An engine refusal is NOT an exception: evaluate returns it.
 */
public interface WorkflowClient {

    /** PUT /internal/workflow/cases/{ref}: register a case or update its summary. Idempotent. */
    Map<String, Object> register(String applicationRef, Map<String, Object> summary);

    /** POST /internal/workflow/backfill: {created, updated, failed:[{applicationRef,error}]}. */
    Map<String, Object> backfill(List<Map<String, Object>> cases);

    /** POST /internal/workflow/cases/{ref}/evaluate. */
    Evaluation evaluate(String applicationRef, EvaluateRequest request);

    /** POST /internal/workflow/info: stage, owner and SLA per case; unknown refs are omitted. */
    Map<String, Map<String, Object>> info(Collection<String> applicationRefs);

    /** POST /internal/workflow/queues/resolve: the first queue the actor may open; ApiException 403 when none. */
    QueueSettings resolveQueue(List<String> keys, WorkflowActor actor);

    /** GET /api/workflow/cases/{ref}/actions with the caller's own token (the actor is taken from it). Null when it cannot be had. */
    Map<String, Object> actionsFor(String applicationRef, String authorizationHeader);
}
