package com.digibank.application.workflow;

import java.util.LinkedHashMap;
import java.util.Map;

/** Body of POST /internal/workflow/cases/{ref}/evaluate. {@code commit=false} is a dry run: nothing is persisted. */
public record EvaluateRequest(String action, WorkflowActor actor, Map<String, Object> input, Map<String, Object> fields,
                              boolean commit, String idempotencyKey) {

    public EvaluateRequest withCommit(boolean commit) {
        return new EvaluateRequest(action, actor, input, fields, commit, idempotencyKey);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("action", action);
        m.put("actor", actor.toMap());
        m.put("input", input == null ? Map.of() : input);
        m.put("fields", fields == null ? Map.of() : fields);
        m.put("commit", commit);
        if (idempotencyKey != null) m.put("idempotencyKey", idempotencyKey);
        return m;
    }
}
