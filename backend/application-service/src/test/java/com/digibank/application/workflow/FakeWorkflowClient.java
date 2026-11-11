package com.digibank.application.workflow;

import com.digibank.application.client.WorkflowClient;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

/**
 * A scriptable stand-in for workflow-service. {@link #engine} answers each evaluate call (it is told whether this is
 * the n-th call of the same kind) and may throw WorkflowUnavailableException to play a down service. Every call is
 * recorded, in order, so a test can assert what was asked and when.
 */
class FakeWorkflowClient implements WorkflowClient {

    final List<String> calls = new ArrayList<>();
    final List<EvaluateRequest> evaluations = new ArrayList<>();
    final List<Map<String, Object>> registered = new ArrayList<>();
    Map<String, Object> backfillAnswer = Map.of("created", 0, "updated", 0, "failed", List.of());
    final List<List<Map<String, Object>>> backfills = new ArrayList<>();
    Map<String, Map<String, Object>> infoAnswer = Map.of();
    QueueSettings queueAnswer;
    RuntimeException failEverything;
    Map<String, Object> actionsAnswer;

    /** (request, attempt-number-for-this-commit-flag) -> answer */
    BiFunction<EvaluateRequest, Integer, Evaluation> engine = (r, n) -> Evaluation.refusal(404, "UNKNOWN_ACTION", "no script");

    private int dryRuns, commits;

    int commitCalls() { return commits; }
    int dryRunCalls() { return dryRuns; }

    @Override
    public Map<String, Object> register(String ref, Map<String, Object> summary) {
        calls.add("register:" + ref);
        if (failEverything != null) throw failEverything;
        registered.add(summary);
        return Map.of("applicationRef", ref, "created", true);
    }

    @Override
    public Map<String, Object> backfill(List<Map<String, Object>> cases) {
        calls.add("backfill:" + cases.size());
        if (failEverything != null) throw failEverything;
        backfills.add(cases);
        return backfillAnswer;
    }

    @Override
    public Evaluation evaluate(String ref, EvaluateRequest request) {
        calls.add("evaluate:" + request.action() + ":" + (request.commit() ? "commit" : "dry"));
        evaluations.add(request);
        if (failEverything != null) throw failEverything;
        int n = request.commit() ? ++commits : ++dryRuns;
        return engine.apply(request, n);
    }

    @Override
    public Map<String, Map<String, Object>> info(Collection<String> refs) {
        calls.add("info:" + refs.size());
        if (failEverything != null) throw failEverything;
        return infoAnswer;
    }

    @Override
    public QueueSettings resolveQueue(List<String> keys, WorkflowActor actor) {
        calls.add("queues:" + String.join(",", keys));
        if (failEverything != null) throw failEverything;
        if (queueAnswer == null) throw new com.digibank.application.config.ApiException(403, "Forbidden.");
        return queueAnswer;
    }

    @Override
    public Map<String, Object> actionsFor(String ref, String authorization) {
        calls.add("actions:" + ref);
        return actionsAnswer;
    }

    // ---- canned engine answers, shaped as workflow-service sends them ----

    static Map<String, Object> effect(String type, Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", type);
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    /** A successful evaluation moving the case track to {@code toStatus} (mirror.status), with the given effects. */
    static Evaluation success(String action, String event, String toStatus, Map<String, Object> fieldUpdates, List<Map<String, Object>> effects) {
        Map<String, Object> mirror = new LinkedHashMap<>();
        if (toStatus != null) mirror.put("status", toStatus);
        return new Evaluation(true, 200, null, null, action, event, "case", Map.of("status", "X"), Map.of("status", toStatus == null ? "X" : toStatus),
                fieldUpdates, false, null, effects, Map.of("reason", "because"), mirror,
                Map.of("write", true, "eventType", event, "actor", "Staff 50", "actorRole", "UNDERWRITER", "detail", action + ": X -> " + toStatus), true, false);
    }

    static Evaluation withReferral(Evaluation e, boolean close, String openTo) {
        return new Evaluation(e.ok(), e.status(), e.code(), e.message(), e.action(), e.event(), e.track(), e.from(), e.to(), e.fieldUpdates(), close, openTo,
                e.hostEffects(), e.log(), e.mirror(), e.audit(), e.committed(), e.replayed());
    }

    static Evaluation replayed(Evaluation e) {
        return new Evaluation(e.ok(), e.status(), e.code(), e.message(), e.action(), e.event(), e.track(), e.from(), e.to(), e.fieldUpdates(), e.referralClose(),
                e.referralOpenToRole(), e.hostEffects(), e.log(), e.mirror(), e.audit(), true, true);
    }
}
