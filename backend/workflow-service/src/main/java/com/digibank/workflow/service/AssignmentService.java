package com.digibank.workflow.service;

import com.digibank.workflow.client.Directory;
import com.digibank.workflow.client.Directory.OrgUnit;
import com.digibank.workflow.client.Directory.StaffMember;
import com.digibank.workflow.engine.Js;
import com.digibank.workflow.engine.Routing;
import com.digibank.workflow.engine.Routing.Candidate;
import com.digibank.workflow.engine.Routing.Sla;
import com.digibank.workflow.model.WfCaseSummary;
import com.digibank.workflow.model.WfCaseTrack;
import com.digibank.workflow.model.WfStaffAvailability;
import com.digibank.workflow.repository.WfCaseSummaryRepository;
import com.digibank.workflow.repository.WfCaseTrackRepository;
import com.digibank.workflow.repository.WfStaffAvailabilityRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Case ownership, routing and SLA clocks (port of the Worker's assignment.ts and the ownership half of
 * routes/workflow.ts). Which roles own a stage, how cases are routed into it and how long it may take are
 * all in the definition's stage block; this applies them. Contract: workflow-spec/README.md,
 * "Ownership, routing and SLA".
 */
@Service
public class AssignmentService {

    private final CaseService caseService;
    private final DefinitionService definitions;
    private final WfCaseTrackRepository trackRepo;
    private final WfCaseSummaryRepository summaries;
    private final WfStaffAvailabilityRepository availability;
    private final Directory.Staff staff;
    private final Directory.Org org;
    private final Visibility visibility;
    private final AuditSink audit;

    public AssignmentService(CaseService caseService, DefinitionService definitions, WfCaseTrackRepository trackRepo, WfCaseSummaryRepository summaries,
                             WfStaffAvailabilityRepository availability, Directory.Staff staff, Directory.Org org, Visibility visibility, AuditSink audit) {
        this.caseService = caseService;
        this.definitions = definitions;
        this.trackRepo = trackRepo;
        this.summaries = summaries;
        this.availability = availability;
        this.staff = staff;
        this.org = org;
        this.visibility = visibility;
        this.audit = audit;
    }

    private static Map<String, Object> stageOf(Map<String, Object> def, String stageKey) {
        if (stageKey == null) return null;
        for (Object s : Js.listOrEmpty(def.get("stages"))) if (stageKey.equals(Js.map(s).get("key"))) return Js.map(s);
        return null;
    }

    private static Map<String, Object> statusOf(Map<String, Object> def, String track, String status) {
        for (Object t : Js.listOrEmpty(def.get("tracks"))) {
            if (!track.equals(Js.map(t).get("key"))) continue;
            for (Object s : Js.listOrEmpty(Js.map(t).get("statuses"))) if (status.equals(Js.map(s).get("key"))) return Js.map(s);
        }
        return null;
    }

    private static boolean terminal(Map<String, Object> def, String track, String status) {
        Map<String, Object> st = statusOf(def, track, status);
        return st != null && "TERMINAL".equals(st.get("category"));
    }

    // ------------------------------------------------------------------ eligibility and routing

    /** Staff who may own a case in the stage: holders of the stage's owning roles (or, with none configured, anyone able
     * to open the pipeline), matched on org unit by the stage's unit rule and able to see the case under their own
     * role's scope. Includes unavailable people (flagged). */
    public List<Candidate> eligibleStaff(Map<String, Object> def, String stageKey, Long caseUnit, String trackKey) {
        Map<String, Object> stage = stageOf(def, stageKey);
        Map<String, Object> owner = stage == null ? null : Js.map(stage.get("owner"));
        List<String> roles = new ArrayList<>();
        if (owner != null) for (Object r : Js.listOrEmpty(owner.get("roles"))) roles.add((String) r);
        boolean fallbackToPipelineHolders = roles.isEmpty();
        String rule = owner != null && owner.get("unitRule") != null ? (String) owner.get("unitRule") : "ANY";
        List<Long> caseAncestors = "CASE_UNIT_OR_ANCESTOR".equals(rule) && caseUnit != null ? visibility.ancestors(caseUnit) : List.of();

        List<StaffMember> eligible = new ArrayList<>();
        for (StaffMember u : staff.staff(roles, null)) {
            if (!roles.isEmpty() && !roles.contains(u.role())) continue;
            if (fallbackToPipelineHolders && u.entitlements() != null && !u.entitlements().contains("queue.pipeline")) continue;
            if (caseUnit != null) {
                if ("CASE_UNIT".equals(rule) && !caseUnit.equals(u.orgUnitId())) continue;
                if ("CASE_UNIT_OR_ANCESTOR".equals(rule) && (u.orgUnitId() == null || !caseAncestors.contains(u.orgUnitId()))) continue;
            }
            if (!visibility.canSee(u.scope(), u.orgUnitId(), caseUnit)) continue;
            eligible.add(u);
        }
        if (eligible.isEmpty()) return List.of();

        Set<String> done = new HashSet<>();
        for (Object t : Js.listOrEmpty(def.get("tracks"))) {
            if (!trackKey.equals(Js.map(t).get("key"))) continue;
            for (Object s : Js.listOrEmpty(Js.map(t).get("statuses"))) {
                if ("TERMINAL".equals(Js.map(s).get("category"))) done.add((String) Js.map(s).get("key"));
            }
        }
        List<Long> ids = eligible.stream().map(StaffMember::userId).toList();
        List<WfCaseTrack> owned = trackRepo.findByAssigneeUserIdInAndTrackKey(ids, trackKey);
        Map<Long, Boolean> override = new HashMap<>();
        for (WfStaffAvailability a : availability.findAllById(ids)) override.put(a.userId, a.available);

        List<Candidate> out = new ArrayList<>();
        for (StaffMember u : eligible) {
            int load = 0;
            String last = null;
            for (WfCaseTrack t : owned) {
                if (t.assigneeUserId != u.userId()) continue;
                if (!done.contains(t.status)) load++;
                if (t.assignedAt != null && (last == null || t.assignedAt.compareTo(last) > 0)) last = t.assignedAt;
            }
            String name = u.fullName() != null && !u.fullName().isBlank() ? u.fullName().trim() : u.role() + " #" + u.userId();
            out.add(new Candidate(u.userId(), name, u.role(), override.getOrDefault(u.userId(), u.available()), load, last));
        }
        return out;
    }

    /** Who a case entering the stage should be given to, per that stage's routing mode (null = nobody). */
    public Candidate routeOnEntry(Map<String, Object> def, Long caseUnit, String stageKey, String trackKey) {
        Map<String, Object> stage = stageOf(def, stageKey);
        Map<String, Object> routing = stage == null ? null : Js.map(stage.get("routing"));
        String mode = routing == null ? "MANUAL" : (String) routing.get("mode");
        if ("MANUAL".equals(mode)) return null;
        return Routing.chooseAssignee(eligibleStaff(def, stageKey, caseUnit, trackKey), mode);
    }

    // ------------------------------------------------------------------ read model

    /** Stage, owner and SLA clock for each case, using the definition version each is pinned to. The track that is in
     * progress wins, so a finished or not-yet-started disbursement never hides the case's own clock. */
    public Map<String, Map<String, Object>> infoFor(List<String> refs, Instant now) {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        for (String ref : refs) {
            if (!caseService.exists(ref)) continue;
            CaseService.Loaded l = caseService.load(ref);
            out.put(ref, infoOf(l, now));
        }
        return out;
    }

    public Map<String, Object> infoOf(CaseService.Loaded l, Instant now) {
        Map<String, Object> def = l.definition();
        List<WfCaseTrack> rows = new ArrayList<>(l.rows().values());
        WfCaseTrack caseRow = rows.stream().filter(r -> r.trackKey.equals("case")).findFirst().orElse(null);
        if (caseRow == null) {
            caseRow = new WfCaseTrack();
            caseRow.applicationRef = l.wfCase().applicationRef;
            caseRow.trackKey = "case";
            caseRow.status = l.summary().status == null ? "DRAFT" : l.summary().status;
            Map<String, Object> st = statusOf(def, "case", caseRow.status);
            caseRow.stage = st == null ? null : (String) st.get("stage");
            caseRow.enteredAt = l.summary().updatedAt;
            rows.add(caseRow);
        }
        WfCaseTrack primary = null;
        WfCaseTrack firstOpen = null;
        for (WfCaseTrack r : rows) {
            if (r.stage == null || terminal(def, r.trackKey, r.status)) continue;
            if (firstOpen == null) firstOpen = r;
            if (!r.trackKey.equals("case") && primary == null) primary = r;
        }
        if (primary == null) primary = firstOpen;
        if (primary == null) primary = caseRow;
        Map<String, Object> stage = stageOf(def, primary.stage);
        Sla sla = Routing.slaStatus(stage, primary.enteredAt, now, terminal(def, primary.trackKey, primary.status));
        return Js.obj("track", primary.trackKey, "status", primary.status, "stage", primary.stage,
                "stageLabel", stage == null ? null : stage.get("label"), "enteredAt", primary.enteredAt,
                "assigneeUserId", primary.assigneeUserId, "assigneeName", primary.assigneeUserId == null ? null : primary.assigneeName,
                "assignedAt", primary.assignedAt, "sla", sla.toJson());
    }

    public Map<String, Object> info(String ref) {
        return infoOf(caseService.load(ref), Instant.now());
    }

    // ------------------------------------------------------------------ ownership operations

    /** The case, checked visible to the caller and open: the context every ownership endpoint needs. */
    public CaseService.Loaded ownershipContext(Caller caller, String ref) {
        if (!caller.isStaff()) throw new WorkflowException("Forbidden.", 403);
        CaseService.Loaded l = caseService.load(ref);
        if (!visibility.canSee(caller.actor().scope(), caller.orgUnitId(), l.summary().orgUnitId)) throw new WorkflowException("Application not found.", 404);
        Map<String, Object> info = infoOf(l, Instant.now());
        if (terminal(l.definition(), (String) info.get("track"), (String) info.get("status"))) {
            throw new WorkflowException("This case is closed, so it cannot be assigned.", 409);
        }
        return l;
    }

    public List<Map<String, Object>> eligible(Caller caller, String ref) {
        requireEntitlement(caller, "case.assign");
        CaseService.Loaded l = ownershipContext(caller, ref);
        Map<String, Object> info = infoOf(l, Instant.now());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Candidate c : eligibleStaff(l.definition(), (String) info.get("stage"), l.summary().orgUnitId, (String) info.get("track"))) out.add(c.toJson());
        return out;
    }

    private static void requireEntitlement(Caller caller, String key) {
        if (!caller.isStaff() || !caller.actor().has(key)) throw new WorkflowException("Forbidden.", 403);
    }

    @Transactional
    public Map<String, Object> claim(Caller caller, String ref) {
        CaseService.Loaded l = ownershipContext(caller, ref);
        Map<String, Object> info = infoOf(l, Instant.now());
        long me = caller.actor().userId();
        List<Candidate> eligible = eligibleStaff(l.definition(), (String) info.get("stage"), l.summary().orgUnitId, (String) info.get("track"));
        if (eligible.stream().noneMatch(e -> e.userId() == me)) throw new WorkflowException("Your role does not own cases in this stage.", 403);
        Long current = (Long) info.get("assigneeUserId");
        if (current != null && current == me) return info;
        if (current != null) {
            Object n = info.get("assigneeName");
            throw new WorkflowException("This case is already assigned to " + (n == null ? "someone else" : n) + ". Ask for it to be reassigned.", 409);
        }
        setOwner(ref, (String) info.get("track"), me, caller.actor().name());
        audit.record("CASE_CLAIMED", "LoanApplication", ref, caller.actor().name(), caller.actor().role(), (String) info.get("stage"));
        return info(ref);
    }

    @Transactional
    public Map<String, Object> assign(Caller caller, String ref, Object userIdRaw) {
        requireEntitlement(caller, "case.assign");
        CaseService.Loaded l = ownershipContext(caller, ref);
        Map<String, Object> info = infoOf(l, Instant.now());
        if (!(userIdRaw instanceof Number n) || n.doubleValue() != Math.rint(n.doubleValue())) throw new WorkflowException("userId is required.", 400);
        long target = n.longValue();
        List<Candidate> eligible = eligibleStaff(l.definition(), (String) info.get("stage"), l.summary().orgUnitId, (String) info.get("track"));
        Candidate pick = eligible.stream().filter(e -> e.userId() == target).findFirst()
                .orElseThrow(() -> new WorkflowException("That person cannot own cases in this stage or cannot see this case.", 400));
        setOwner(ref, (String) info.get("track"), target, pick.name());
        Object prev = info.get("assigneeName");
        audit.record(info.get("assigneeUserId") == null ? "CASE_ASSIGNED" : "CASE_REASSIGNED", "LoanApplication", ref, caller.actor().name(),
                caller.actor().role(), (prev == null ? "unassigned" : prev) + " -> " + pick.name());
        return info(ref);
    }

    @Transactional
    public Map<String, Object> release(Caller caller, String ref) {
        CaseService.Loaded l = ownershipContext(caller, ref);
        Map<String, Object> info = infoOf(l, Instant.now());
        Long current = (Long) info.get("assigneeUserId");
        if (current == null) return info;
        if (current != caller.actor().userId()) requireEntitlement(caller, "case.assign");
        setOwner(ref, (String) info.get("track"), null, null);
        audit.record("CASE_RELEASED", "LoanApplication", ref, caller.actor().name(), caller.actor().role(), (String) info.get("assigneeName"));
        return info(ref);
    }

    private void setOwner(String ref, String track, Long userId, String name) {
        WfCaseTrack t = trackRepo.findById(new WfCaseTrack.Key(ref, track)).orElseThrow();
        t.assigneeUserId = userId;
        t.assigneeName = userId == null ? null : name;
        t.assignedAt = userId == null ? null : DefinitionService.now();
        trackRepo.save(t);
    }

    // ------------------------------------------------------------------ availability

    public boolean availability(Caller caller) {
        if (!caller.isStaff()) throw new WorkflowException("Forbidden.", 403);
        return availability.findById(caller.actor().userId()).map(a -> a.available).orElse(true);
    }

    @Transactional
    public boolean setAvailability(Caller caller, Object available) {
        if (!caller.isStaff()) throw new WorkflowException("Forbidden.", 403);
        if (!(available instanceof Boolean b)) throw new WorkflowException("available must be true or false.", 400);
        WfStaffAvailability a = availability.findById(caller.actor().userId()).orElseGet(WfStaffAvailability::new);
        a.userId = caller.actor().userId();
        a.available = b;
        a.updatedAt = DefinitionService.now();
        availability.save(a);
        audit.record(b ? "STAFF_AVAILABLE" : "STAFF_UNAVAILABLE", "User", String.valueOf(a.userId), caller.actor().name(), caller.actor().role(), null);
        return b;
    }

    // ------------------------------------------------------------------ SLA by organisation unit

    private static Map<String, Object> emptyCounts() {
        return Js.obj("green", 0, "amber", 0, "red", 0, "unassigned", 0, "total", 0);
    }

    private static void add(Map<String, Object> into, Map<String, Object> from) {
        for (String k : List.of("green", "amber", "red", "unassigned", "total")) into.put(k, (Integer) into.get(k) + (Integer) from.get(k));
    }

    private static void bump(Map<String, Object> m, String k) { m.put(k, (Integer) m.get(k) + 1); }

    /** Open cases per org unit by SLA state, each unit also rolled up over everything beneath it, limited to the cases
     * the caller may see. */
    public Map<String, Object> slaSummary(Caller caller) {
        if (!caller.isStaff()) throw new WorkflowException("Forbidden.", 403);
        List<String> open = definitions.statusesByCategory(List.of("ACTIVE"));
        Map<Long, Map<String, Object>> own = new LinkedHashMap<>();
        Map<String, Object> noUnit = emptyCounts();
        Instant now = Instant.now();
        if (!open.isEmpty()) {
            for (WfCaseSummary s : summaries.findByStatusIn(open)) {
                if (!visibility.canSee(caller.actor().scope(), caller.orgUnitId(), s.orgUnitId)) continue;
                if (!caseService.exists(s.applicationRef)) continue;
                Map<String, Object> i = infoOf(caseService.load(s.applicationRef), now);
                Map<String, Object> row = s.orgUnitId == null ? noUnit : own.computeIfAbsent(s.orgUnitId, k -> emptyCounts());
                bump(row, "total");
                if (i.get("assigneeUserId") == null) bump(row, "unassigned");
                String state = (String) Js.map(i.get("sla")).get("state");
                if (state.equals("GREEN")) bump(row, "green"); else if (state.equals("AMBER")) bump(row, "amber"); else if (state.equals("RED")) bump(row, "red");
            }
        }
        if (own.isEmpty()) return Js.obj("units", List.of(), "noUnit", noUnit);

        List<OrgUnit> units = org.units();
        Map<Long, Long> parent = new HashMap<>();
        for (OrgUnit u : units) parent.put(u.id(), u.parentId());
        Map<Long, Map<String, Object>> rollup = new LinkedHashMap<>();
        for (Map.Entry<Long, Map<String, Object>> e : own.entrySet()) {
            Set<Long> seen = new HashSet<>();
            for (Long id = e.getKey(); id != null && !seen.contains(id); id = parent.get(id)) {
                seen.add(id);
                add(rollup.computeIfAbsent(id, k -> emptyCounts()), e.getValue());
            }
        }
        List<Object> out = new ArrayList<>();
        for (OrgUnit u : units) {
            if (!rollup.containsKey(u.id())) continue;
            out.add(Js.obj("unitId", u.id(), "name", u.name(), "code", u.code(), "parentId", u.parentId(),
                    "own", own.getOrDefault(u.id(), emptyCounts()), "total", rollup.get(u.id())));
        }
        return Js.obj("units", out, "noUnit", noUnit);
    }
}
