package com.digibank.workflow.service;

import com.digibank.workflow.client.Directory;
import com.digibank.workflow.engine.AuditPolicy;
import com.digibank.workflow.engine.Engine;
import com.digibank.workflow.engine.Js;
import com.digibank.workflow.engine.Model.CaseState;
import com.digibank.workflow.engine.Model.Facts;
import com.digibank.workflow.engine.Model.Request;
import com.digibank.workflow.engine.Presentation;
import com.digibank.workflow.engine.Routing;
import com.digibank.workflow.engine.Routing.Candidate;
import com.digibank.workflow.model.WfCaseSummary;
import com.digibank.workflow.model.WfCaseTrack;
import com.digibank.workflow.model.WfCommand;
import com.digibank.workflow.model.WfReferral;
import com.digibank.workflow.model.WfTransition;
import com.digibank.workflow.repository.WfCaseSummaryRepository;
import com.digibank.workflow.repository.WfCaseTrackRepository;
import com.digibank.workflow.repository.WfCommandRepository;
import com.digibank.workflow.repository.WfReferralRepository;
import com.digibank.workflow.repository.WfTransitionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Evaluates actions with the engine and persists the outcome (port of host.ts's buildFacts, describeActions,
 * resolveQueue and persist). The host-level effects (notes, notifications, emails, documents, card payment) are NOT
 * executed here: they are returned, resolved, for application-service to run, together with the field updates it must
 * write on the application. See README.md for the full internal contract.
 */
@Service
public class TransitionService {

    private final CaseService caseService;
    private final DefinitionService definitions;
    private final AssignmentService assignment;
    private final Visibility visibility;
    private final Directory.Mandates mandates;
    private final Directory.Ladder ladder;
    private final WfCaseTrackRepository trackRepo;
    private final WfCaseSummaryRepository summaries;
    private final WfTransitionRepository transitions;
    private final WfReferralRepository referrals;
    private final WfCommandRepository commands;
    private final AuditSink audit;

    public TransitionService(CaseService caseService, DefinitionService definitions, AssignmentService assignment, Visibility visibility,
                             Directory.Mandates mandates, Directory.Ladder ladder, WfCaseTrackRepository trackRepo, WfCaseSummaryRepository summaries,
                             WfTransitionRepository transitions, WfReferralRepository referrals, WfCommandRepository commands, AuditSink audit) {
        this.caseService = caseService;
        this.definitions = definitions;
        this.assignment = assignment;
        this.visibility = visibility;
        this.mandates = mandates;
        this.ladder = ladder;
        this.trackRepo = trackRepo;
        this.summaries = summaries;
        this.transitions = transitions;
        this.referrals = referrals;
        this.commands = commands;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ facts

    private static boolean hasGuard(Map<String, Object> transition, String type) {
        return Js.listOrEmpty(transition.get("guards")).stream().anyMatch(g -> type.equals(Js.map(g).get("type")));
    }

    /** The facts the engine cannot compute itself. A mandate is only looked up when the action carries a MANDATE guard. */
    Facts facts(Caller caller, WfCaseSummary summary, boolean needsMandate) {
        boolean visible = caller.isSystem() || visibility.canSee(caller.actor().scope(), caller.orgUnitId(), summary.orgUnitId);
        boolean isOwner = summary.customerId != null && summary.customerId == caller.actor().userId();
        Double limit = caller.isStaff() && needsMandate ? mandates.limit(caller.actor().role(), summary.orgUnitId, summary.applicationType) : null;
        return new Facts(visible, isOwner, limit, ladder.ladder());
    }

    // ------------------------------------------------------------------ what the caller can do

    /** GET /cases/{ref}/actions: what the caller can do to this case right now, with labels, for the UI to render buttons from. */
    public Map<String, Object> describeActions(Caller caller, String ref) {
        CaseService.Loaded l = caseService.load(ref);
        if (!caller.isSystem()) {
            // A customer may only ask about their own case; staff are subject to org scope.
            if (caller.actor().type().equals("CUSTOMER") && !(l.summary().customerId != null && l.summary().customerId == caller.actor().userId())) {
                throw new WorkflowException("Application not found.", 404);
            }
            if (caller.isStaff() && !visibility.canSee(caller.actor().scope(), caller.orgUnitId(), l.summary().orgUnitId)) {
                throw new WorkflowException("Application not found.", 404);
            }
        }
        Map<String, Object> r = Engine.allowedActions(l.definition(), l.state(), caller.actor(), facts(caller, l.summary(), false));

        Map<String, Map<String, Object>> meta = new LinkedHashMap<>();
        List<String> order = new ArrayList<>();
        for (Object to : Js.listOrEmpty(l.definition().get("tracks"))) {
            Map<String, Object> t = Js.map(to);
            for (Object xo : Js.listOrEmpty(t.get("transitions"))) {
                Map<String, Object> x = Js.map(xo);
                order.add((String) x.get("key"));
                meta.put((String) x.get("key"), Js.obj("track", t.get("key"), "label", x.get("label"), "event", Engine.eventOf((String) t.get("key"), x),
                        "inputs", Presentation.inputsOf(x).stream().map(Presentation.ActionInput::toJson).toList(),
                        "ui", Presentation.resolveUi((String) t.get("key"), x).toJson()));
            }
        }
        @SuppressWarnings("unchecked")
        List<String> allowedKeys = new ArrayList<>((List<String>) r.get("allowed"));
        // In the definition's own order (the engine returns them alphabetically), so buttons appear in the order the workflow lists its actions.
        allowedKeys.sort(Comparator.comparingInt(order::indexOf));
        List<Object> allowed = new ArrayList<>();
        for (String k : allowedKeys) {
            Map<String, Object> m = meta.get(k);
            allowed.add(Js.obj("key", k, "track", m.get("track"), "label", m.get("label"), "event", m.get("event"), "inputs", m.get("inputs"), "ui", m.get("ui")));
        }
        Map<String, Object> blocked = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : Js.map(r.get("blocked")).entrySet()) {
            blocked.put(e.getKey(), Js.obj("code", e.getValue(), "label", meta.get(e.getKey()).get("label")));
        }
        return Js.obj("allowed", allowed, "blocked", blocked);
    }

    /** GET /queues/{key}: whether the caller may open the queue in the published definition, and its filter settings. */
    public Map<String, Object> queue(Caller caller, String key) {
        Map<String, Object> def = definitions.parse(definitions.ensureDefault());
        Map<String, Object> r = Engine.queueAccess(def, caller.actor(), key);
        if (!Engine.ok(r)) throw new WorkflowException((String) r.get("message"), (Integer) r.get("status"));
        return Js.obj("queue", r.get("queue"), "statuses", r.get("statuses"), "applyScope", r.get("applyScope"), "hideReferredAbove", r.get("hideReferredAbove"));
    }

    /** The first of the keys the caller may open: the Worker's resolveQueue (home tiles pick the staff or banker variant). */
    public Map<String, Object> resolveQueue(Caller caller, List<String> keys) {
        Map<String, Object> def = definitions.parse(definitions.ensureDefault());
        for (String key : keys) {
            Map<String, Object> r = Engine.queueAccess(def, caller.actor(), key);
            if (Engine.ok(r)) {
                return Js.obj("queue", r.get("queue"), "statuses", r.get("statuses"), "applyScope", r.get("applyScope"), "hideReferredAbove", r.get("hideReferredAbove"));
            }
        }
        throw new WorkflowException("Forbidden.", 403);
    }

    // ------------------------------------------------------------------ run an action

    /**
     * Evaluates an action on a case and, unless {@code commit} is false, persists the new state, history, referral rows and
     * routing in one transaction. Returns the engine result (ok or failure) plus, on success, the blocks application-service
     * needs: {@code mirror} (the legacy status columns), {@code audit} and {@code routed}. A repeated idempotency key replays
     * the first answer without evaluating again. Failures are returned as {ok:false,...}, never persisted.
     */
    @Transactional
    public Map<String, Object> run(String ref, Caller caller, String action, Map<String, Object> input, Map<String, Object> fieldsOverride,
                                   boolean commit, String idempotencyKey) {
        if (idempotencyKey != null) {
            WfCommand prior = commands.findById(idempotencyKey).orElse(null);
            if (prior != null) {
                if (!prior.applicationRef.equals(ref)) throw new WorkflowException("Idempotency key already used for another case.", 409);
                Map<String, Object> replay = Json.parseMap(prior.responseJson);
                replay.put("replayed", true);
                return replay;
            }
        }
        if (!caseService.exists(ref)) return Engine.fail(404, "CASE_NOT_REGISTERED", "Application not found: " + ref);
        CaseService.Loaded l = commit ? caseService.loadLocked(ref) : caseService.load(ref);
        Engine.Found found = Engine.findTransition(l.definition(), action);
        Map<String, Object> fields = new LinkedHashMap<>(CaseService.fieldsOf(l.summary(), l.definition()));
        if (fieldsOverride != null) {
            for (String k : List.of("referredToRole", "approvedAmount", "guarantorRequired", "guarantorDetailsPresent", "currentSection")) {
                if (fieldsOverride.containsKey(k)) fields.put(k, fieldsOverride.get(k));
            }
        }
        CaseState state = new CaseState(l.tracks(), fields);
        Facts facts = facts(caller, l.summary(), found != null && hasGuard(found.transition(), "MANDATE"));

        String now = Routing.iso(Instant.now());
        Map<String, Object> result = Engine.evaluate(l.definition(), state, new Request(action, caller.actor(), input, now), facts);
        if (!Engine.ok(result)) return result;

        Map<String, Object> out = new LinkedHashMap<>(result);
        Map<String, Object> to = Js.map(result.get("to"));
        Map<String, Object> from = Js.map(result.get("from"));
        boolean statusChanged = !from.get("status").equals(to.get("status"));
        boolean stageChanged = statusChanged && !java.util.Objects.equals(from.get("stage"), to.get("stage"));
        String track = (String) result.get("track");

        Candidate routed = null;
        if (commit) {
            routed = stageChanged ? assignment.routeOnEntry(l.definition(), l.summary().orgUnitId, (String) to.get("stage"), track) : null;
            persist(l, result, caller, found, statusChanged, stageChanged, routed, now);
        }

        // The legacy status columns application-service mirrors: written only from the engine's answer.
        Map<String, Object> mirror = new LinkedHashMap<>();
        if (statusChanged && track.equals("case")) mirror.put("status", to.get("status"));
        if (statusChanged && track.equals("disbursement")) mirror.put("disbursementStatus", to.get("status").equals("NOT_STARTED") ? null : to.get("status"));
        out.put("mirror", mirror);

        Map<String, Object> log = Js.map(result.get("log"));
        String reason = (String) log.get("reason");
        out.put("audit", Js.obj("write", AuditPolicy.auditsEvent(result), "eventType", result.get("event"), "actor", log.get("actorName"),
                "actorRole", log.get("actorRole"),
                "detail", result.get("action") + ": " + log.get("fromStatus") + " -> " + log.get("toStatus") + (reason != null && !reason.isEmpty() ? " (" + reason + ")" : "")));
        out.put("routed", routed == null ? null : Js.obj("userId", routed.userId(), "name", routed.name(), "stage", to.get("stage")));
        out.put("committed", commit);
        out.put("replayed", false);

        if (commit && idempotencyKey != null) {
            WfCommand c = new WfCommand();
            c.idempotencyKey = idempotencyKey;
            c.applicationRef = ref;
            c.responseJson = Json.write(out);
            c.createdAt = now;
            commands.save(c);
        }
        return out;
    }

    private void persist(CaseService.Loaded l, Map<String, Object> r, Caller caller, Engine.Found found, boolean statusChanged, boolean stageChanged,
                         Candidate routed, String now) {
        String ref = l.wfCase().applicationRef;
        String track = (String) r.get("track");
        Map<String, Object> to = Js.map(r.get("to"));
        Map<String, Object> log = Js.map(r.get("log"));

        if (statusChanged) {
            // Entering a new stage loses the previous owner; if the stage routes automatically a new owner is chosen in the same write.
            WfCaseTrack t = l.rows().get(track);
            if (t == null) { t = new WfCaseTrack(); t.applicationRef = ref; t.trackKey = track; }
            t.status = (String) to.get("status");
            t.stage = (String) to.get("stage");
            t.enteredAt = now;
            if (stageChanged) {
                t.assigneeUserId = routed == null ? null : routed.userId();
                t.assigneeName = routed == null ? null : routed.name();
                t.assignedAt = routed == null ? null : now;
            }
            trackRepo.save(t);
        }

        // History records real workflow moves, not notes or staff edits (those have no target status).
        if (found.transition().get("to") != null) {
            WfTransition w = new WfTransition();
            w.applicationRef = ref;
            w.trackKey = track;
            w.action = (String) log.get("action");
            w.event = (String) log.get("event");
            w.fromStatus = (String) log.get("fromStatus");
            w.toStatus = (String) log.get("toStatus");
            w.fromStage = (String) log.get("fromStage");
            w.toStage = (String) log.get("toStage");
            w.actorType = (String) log.get("actorType");
            w.actorUserId = ((Number) log.get("actorUserId")).longValue();
            w.actorName = (String) log.get("actorName");
            w.actorRole = (String) log.get("actorRole");
            w.reason = (String) log.get("reason");
            w.at = (String) log.get("at");
            w.definitionId = l.wfCase().definitionId;
            transitions.save(w);
        }

        Map<String, Object> referral = Js.map(r.get("referral"));
        if (Boolean.TRUE.equals(referral.get("close"))) {
            for (WfReferral open : referrals.findByApplicationRefAndResolvedAtIsNull(ref)) {
                open.resolvedAt = now;
                referrals.save(open);
            }
        }
        Map<String, Object> open = Js.map(referral.get("open"));
        if (open != null) {
            WfReferral n = new WfReferral();
            n.applicationRef = ref;
            n.fromRole = caller.actor().role() != null ? caller.actor().role() : "SYSTEM";
            n.fromUserId = caller.actor().userId();
            n.fromName = caller.actor().name();
            n.toRole = (String) open.get("toRole");
            n.reason = (String) log.get("reason");
            n.createdAt = now;
            referrals.save(n);
        }

        // Keep the engine-relevant case fields and the status mirror in the summary consistent with what the host will write.
        WfCaseSummary s = l.summary();
        for (Map.Entry<String, Object> e : Js.map(r.get("fieldUpdates")).entrySet()) {
            Object v = e.getValue();
            switch (e.getKey()) {
                case "referredToRole" -> s.referredToRole = v == null ? null : String.valueOf(v);
                case "approvedAmount" -> s.approvedAmount = v instanceof Number n ? n.doubleValue() : null;
                case "guarantorRequired" -> s.guarantorRequired = Boolean.TRUE.equals(v);
                case "currentSection" -> s.currentSection = v == null ? null : String.valueOf(v);
                default -> { }
            }
        }
        if (statusChanged && track.equals("case")) s.status = (String) to.get("status");
        if (statusChanged && track.equals("disbursement")) s.disbursementStatus = to.get("status").equals("NOT_STARTED") ? null : (String) to.get("status");
        s.updatedAt = now;
        summaries.save(s);

        if (routed != null) {
            audit.record("CASE_AUTO_ASSIGNED", "LoanApplication", ref, "System (Routing)", null, routed.name() + " (" + to.get("stage") + ")");
        }
    }
}
