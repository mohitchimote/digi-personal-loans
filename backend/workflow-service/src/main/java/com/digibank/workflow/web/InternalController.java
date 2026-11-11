package com.digibank.workflow.web;

import com.digibank.workflow.engine.Js;
import com.digibank.workflow.service.AssignmentService;
import com.digibank.workflow.service.Caller;
import com.digibank.workflow.service.CaseService;
import com.digibank.workflow.service.TransitionService;
import com.digibank.workflow.service.WorkflowException;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The internal API application-service calls (README.md, "Internal contract"). Reachable only service-to-service: there
 * is no gateway route for /internal, and like the other internal endpoints it carries no token. The caller sends the
 * actor it is acting for; the gateway-facing API in {@link WorkflowController} derives the actor from the token instead.
 */
@RestController
@RequestMapping("/internal/workflow")
public class InternalController {

    private final CaseService cases;
    private final TransitionService transitions;
    private final AssignmentService assignment;

    public InternalController(CaseService cases, TransitionService transitions, AssignmentService assignment) {
        this.cases = cases;
        this.transitions = transitions;
        this.assignment = assignment;
    }

    private static Map<String, Object> registered(String ref, CaseService.Registered r) {
        return Js.obj("applicationRef", ref, "created", r.created(), "definitionId", r.loaded().wfCase().definitionId, "tracks", r.loaded().tracks());
    }

    /** Creates or updates a case's summary and, the first time, its workflow state. Idempotent. */
    @PutMapping("/cases/{ref}")
    public Map<String, Object> register(@PathVariable String ref, @RequestBody Map<String, Object> body) {
        return registered(ref, cases.register(ref, body));
    }

    /** Registers many existing applications (backfill). Each is independent: failures are listed, not fatal. */
    @PostMapping("/backfill")
    public Map<String, Object> backfill(@RequestBody Map<String, Object> body) {
        int created = 0, updated = 0;
        List<Object> failed = new ArrayList<>();
        for (Object o : Js.listOrEmpty(body.get("cases"))) {
            Map<String, Object> c = Js.map(o);
            String ref = c == null ? null : (String) c.get("applicationRef");
            try {
                if (ref == null) throw new WorkflowException("applicationRef is required.", 400);
                if (cases.register(ref, c).created()) created++; else updated++;
            } catch (RuntimeException e) {
                failed.add(Js.obj("applicationRef", ref, "error", e.getMessage()));
            }
        }
        return Js.obj("created", created, "updated", updated, "failed", failed);
    }

    /** Evaluate an action and (unless commit is false) persist the outcome; the answer is always HTTP 200 with the engine's ok flag. */
    @PostMapping("/cases/{ref}/evaluate")
    public Map<String, Object> evaluate(@PathVariable String ref, @RequestBody Map<String, Object> body,
                                        @RequestHeader(value = "Idempotency-Key", required = false) String headerKey) {
        String action = (String) body.get("action");
        if (action == null || action.isBlank()) throw new WorkflowException("action is required.", 400);
        String key = body.get("idempotencyKey") instanceof String s && !s.isBlank() ? s : headerKey;
        return transitions.run(ref, Caller.fromMap(Js.map(body.get("actor"))), action, Js.map(body.get("input")), Js.map(body.get("fields")),
                !Boolean.FALSE.equals(body.get("commit")), key);
    }

    /** Stage, owner and SLA clock for a batch of cases, for queue and detail screens. Unknown refs are left out. */
    @PostMapping("/info")
    public Map<String, Object> info(@RequestBody Map<String, Object> body) {
        List<String> refs = new ArrayList<>();
        for (Object r : Js.listOrEmpty(body.get("refs"))) refs.add(String.valueOf(r));
        return new java.util.LinkedHashMap<>(assignment.infoFor(refs, Instant.now()));
    }

    /** The first queue in keys the actor may open, with its filter settings (403 when none). */
    @PostMapping("/queues/resolve")
    public Map<String, Object> resolveQueue(@RequestBody Map<String, Object> body) {
        List<String> keys = new ArrayList<>();
        for (Object k : Js.listOrEmpty(body.get("keys"))) keys.add(String.valueOf(k));
        return transitions.resolveQueue(Caller.fromMap(Js.map(body.get("actor"))), keys);
    }
}
