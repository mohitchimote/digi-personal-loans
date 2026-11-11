package com.digibank.workflow.web;

import com.digibank.workflow.engine.Js;
import com.digibank.workflow.security.CurrentUser;
import com.digibank.workflow.service.AssignmentService;
import com.digibank.workflow.service.Caller;
import com.digibank.workflow.service.CaseService;
import com.digibank.workflow.service.DefinitionService;
import com.digibank.workflow.service.TransitionService;
import com.digibank.workflow.service.Visibility;
import com.digibank.workflow.service.WorkflowException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * The runtime API the UI renders from (the Worker's routes/workflow.ts, same paths and shapes): what the statuses are
 * called, which queues exist, what the signed-in user can do to a case right now, who owns it and how long it has been
 * in its stage. POST /cases/{ref}/actions/{action} is deliberately NOT served here: it needs the application row and the
 * host effects, so the gateway routes that one path to application-service (see README.md, "Host split").
 */
@RestController
@RequestMapping("/api/workflow")
public class WorkflowController {

    private final DefinitionService definitions;
    private final TransitionService transitions;
    private final AssignmentService assignment;
    private final CaseService cases;
    private final Visibility visibility;

    public WorkflowController(DefinitionService definitions, TransitionService transitions, AssignmentService assignment, CaseService cases, Visibility visibility) {
        this.definitions = definitions;
        this.transitions = transitions;
        this.assignment = assignment;
        this.cases = cases;
        this.visibility = visibility;
    }

    private static Caller caller() {
        return Caller.of(CurrentUser.get());
    }

    @GetMapping("/definition")
    public Map<String, Object> definition() {
        return definitions.projectPublished();
    }

    @GetMapping("/queues/{key}")
    public Map<String, Object> queue(@PathVariable String key) {
        return transitions.queue(caller(), key);
    }

    @GetMapping("/cases/{ref}/actions")
    public Map<String, Object> actions(@PathVariable String ref) {
        return transitions.describeActions(caller(), ref);
    }

    /** Stage, owner and SLA clock for one case. */
    @GetMapping("/cases/{ref}/state")
    public Map<String, Object> state(@PathVariable String ref) {
        Caller c = caller();
        CaseService.Loaded l = cases.load(ref);
        if (c.isStaff()) {
            if (!visibility.canSee(c.actor().scope(), c.orgUnitId(), l.summary().orgUnitId)) throw new WorkflowException("Application not found.", 404);
        } else if (l.summary().customerId == null || l.summary().customerId != c.actor().userId()) {
            throw new WorkflowException("Application not found.", 404);
        }
        return assignment.infoOf(l, java.time.Instant.now());
    }

    /** Who could own this case in its current stage, with availability and current load. Needs case.assign. */
    @GetMapping("/cases/{ref}/eligible")
    public List<Map<String, Object>> eligible(@PathVariable String ref) {
        return assignment.eligible(caller(), ref);
    }

    @PostMapping("/cases/{ref}/claim")
    public Map<String, Object> claim(@PathVariable String ref) {
        return assignment.claim(caller(), ref);
    }

    @PostMapping("/cases/{ref}/assign")
    public Map<String, Object> assign(@PathVariable String ref, @RequestBody(required = false) Map<String, Object> body) {
        return assignment.assign(caller(), ref, body == null ? null : body.get("userId"));
    }

    @PostMapping("/cases/{ref}/release")
    public Map<String, Object> release(@PathVariable String ref) {
        return assignment.release(caller(), ref);
    }

    @GetMapping("/availability")
    public Map<String, Object> availability() {
        return Js.obj("available", assignment.availability(caller()));
    }

    @PutMapping("/availability")
    public Map<String, Object> setAvailability(@RequestBody(required = false) Map<String, Object> body) {
        return Js.obj("available", assignment.setAvailability(caller(), body == null ? null : body.get("available")));
    }

    @GetMapping("/sla-summary")
    public Map<String, Object> slaSummary() {
        return assignment.slaSummary(caller());
    }
}
