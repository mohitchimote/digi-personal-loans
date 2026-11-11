package com.digibank.workflow.service;

import com.digibank.workflow.engine.Engine;
import com.digibank.workflow.engine.Js;
import com.digibank.workflow.engine.Model.CaseState;
import com.digibank.workflow.model.WfCase;
import com.digibank.workflow.model.WfCaseSummary;
import com.digibank.workflow.model.WfCaseTrack;
import com.digibank.workflow.model.WfDefinition;
import com.digibank.workflow.repository.WfCaseRepository;
import com.digibank.workflow.repository.WfCaseSummaryRepository;
import com.digibank.workflow.repository.WfCaseTrackRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Case registration and loading. application-service pushes a summary of each application (and the
 * host-owned fields the engine reads) with {@link #register}; the workflow state itself (track statuses,
 * stages, owners) belongs to this service and is only ever changed by evaluated actions. A case is pinned
 * to the definition published when it first registers.
 */
@Service
public class CaseService {

    /** A case with its pinned definition, current track state and summary. */
    public record Loaded(WfCase wfCase, WfDefinition definitionRow, Map<String, Object> definition,
                         Map<String, Map<String, Object>> tracks, Map<String, WfCaseTrack> rows, WfCaseSummary summary) {
        public CaseState state() { return new CaseState(tracks, fieldsOf(summary, definition)); }
    }

    private final DefinitionService definitions;
    private final WfCaseRepository cases;
    private final WfCaseTrackRepository trackRepo;
    private final WfCaseSummaryRepository summaries;

    public CaseService(DefinitionService definitions, WfCaseRepository cases, WfCaseTrackRepository trackRepo, WfCaseSummaryRepository summaries) {
        this.definitions = definitions;
        this.cases = cases;
        this.trackRepo = trackRepo;
        this.summaries = summaries;
    }

    /** The host-owned fields the engine reads (workflow-spec "case.fields"). */
    public static Map<String, Object> fieldsOf(WfCaseSummary s, Map<String, Object> def) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("referredToRole", s.referredToRole);
        f.put("approvedAmount", s.approvedAmount);
        f.put("guarantorRequired", s.guarantorRequired);
        f.put("guarantorDetailsPresent", s.guarantorDetailsPresent);
        f.put("currentSection", s.currentSection);
        f.put("applicationType", "BUSINESS".equals(s.applicationType) ? "BUSINESS" : "PERSONAL");
        f.put("orgUnitId", s.orgUnitId);
        return f;
    }

    public boolean exists(String ref) {
        return cases.findByApplicationRef(ref).isPresent();
    }

    public Loaded load(String ref) {
        WfCase wc = cases.findByApplicationRef(ref).orElseThrow(() -> new WorkflowException("Application not found.", 404));
        return loaded(wc);
    }

    /** Same as {@link #load} but takes a row lock on the case until the surrounding transaction ends. */
    public Loaded loadLocked(String ref) {
        WfCase wc = cases.lockByApplicationRef(ref).orElseThrow(() -> new WorkflowException("Application not found.", 404));
        return loaded(wc);
    }

    private Loaded loaded(WfCase wc) {
        WfDefinition row = definitions.getRow(wc.definitionId);
        Map<String, Object> def = definitions.parse(row);
        Map<String, WfCaseTrack> rows = new LinkedHashMap<>();
        for (WfCaseTrack t : trackRepo.findByApplicationRef(wc.applicationRef)) rows.put(t.trackKey, t);
        WfCaseSummary summary = summaries.findById(wc.applicationRef).orElseGet(() -> blankSummary(wc.applicationRef));
        Map<String, Map<String, Object>> tracks = new LinkedHashMap<>();
        // Tracks added to the definition after this case registered start at their initial status.
        Map<String, Object> base = Engine.createCase(def, firstEntry(def));
        if (Engine.ok(base)) for (Map.Entry<String, Object> e : Js.map(base.get("tracks")).entrySet()) tracks.put(e.getKey(), Js.map(e.getValue()));
        for (WfCaseTrack t : rows.values()) tracks.put(t.trackKey, Js.obj("status", t.status, "stage", t.stage));
        return new Loaded(wc, row, def, tracks, rows, summary);
    }

    private static WfCaseSummary blankSummary(String ref) {
        WfCaseSummary s = new WfCaseSummary();
        s.applicationRef = ref;
        s.applicationType = "PERSONAL";
        s.updatedAt = DefinitionService.now();
        return s;
    }

    private static String firstEntry(Map<String, Object> def) {
        for (Object t : Js.listOrEmpty(def.get("tracks"))) {
            List<Object> eps = Js.listOrEmpty(Js.map(t).get("entryPoints"));
            if (!eps.isEmpty()) return (String) Js.map(eps.get(0)).get("key");
        }
        return "start";
    }

    private static Long asLong(Object o) { return o instanceof Number n ? n.longValue() : null; }

    private static Double asDouble(Object o) { return o instanceof Number n ? n.doubleValue() : null; }

    /** What register did: whether it created the workflow state, and the loaded case. */
    public record Registered(boolean created, Loaded loaded) {}

    /**
     * Creates or updates the case summary, and on first sight creates the workflow state: from the application's
     * current status and disbursementStatus when given (backfill of an existing application), else from the
     * definition's entry point ("start" or "start_pre_approved"). Idempotent: for a case that already exists only the
     * summary fields present in the body are updated; track state is never changed here.
     */
    @Transactional
    public Registered register(String ref, Map<String, Object> body) {
        WfCaseSummary s = summaries.findById(ref).orElseGet(() -> blankSummary(ref));
        if (body.containsKey("applicationType")) s.applicationType = "BUSINESS".equals(body.get("applicationType")) ? "BUSINESS" : "PERSONAL";
        if (body.containsKey("orgUnitId")) s.orgUnitId = asLong(body.get("orgUnitId"));
        if (body.containsKey("customerId")) s.customerId = asLong(body.get("customerId"));
        if (body.containsKey("applicantName")) s.applicantName = (String) body.get("applicantName");
        if (body.containsKey("amount")) s.amount = asDouble(body.get("amount"));
        if (body.containsKey("purpose")) s.purpose = (String) body.get("purpose");
        if (body.containsKey("termMonths")) s.termMonths = body.get("termMonths") instanceof Number n ? n.intValue() : null;
        if (body.containsKey("referredToRole")) s.referredToRole = (String) body.get("referredToRole");
        if (body.containsKey("approvedAmount")) s.approvedAmount = asDouble(body.get("approvedAmount"));
        if (body.containsKey("guarantorRequired")) s.guarantorRequired = Boolean.TRUE.equals(body.get("guarantorRequired"));
        if (body.containsKey("guarantorDetailsPresent")) s.guarantorDetailsPresent = Boolean.TRUE.equals(body.get("guarantorDetailsPresent"));
        if (body.containsKey("currentSection")) s.currentSection = (String) body.get("currentSection");

        boolean created = !exists(ref);
        if (created) {
            WfDefinition published = definitions.ensureDefault();
            Map<String, Object> def = definitions.parse(published);
            Map<String, Map<String, Object>> tracks = initialTracks(ref, def, body);
            String entered = body.get("enteredAt") instanceof String e && !e.isBlank() ? e : DefinitionService.now();
            WfCase wc = new WfCase();
            wc.applicationRef = ref;
            wc.definitionId = published.id;
            wc.createdAt = DefinitionService.now();
            cases.save(wc);
            for (Map.Entry<String, Map<String, Object>> e : tracks.entrySet()) {
                WfCaseTrack t = new WfCaseTrack();
                t.applicationRef = ref;
                t.trackKey = e.getKey();
                t.status = (String) e.getValue().get("status");
                t.stage = (String) e.getValue().get("stage");
                t.enteredAt = entered;
                trackRepo.save(t);
            }
            s.status = tracks.containsKey("case") ? (String) tracks.get("case").get("status") : null;
            String dis = tracks.containsKey("disbursement") ? (String) tracks.get("disbursement").get("status") : null;
            s.disbursementStatus = "NOT_STARTED".equals(dis) ? null : dis;
        }
        s.updatedAt = DefinitionService.now();
        summaries.save(s);
        return new Registered(created, load(ref));
    }

    private Map<String, Map<String, Object>> initialTracks(String ref, Map<String, Object> def, Map<String, Object> body) {
        String entry = body.get("entry") instanceof String e ? e : "start";
        Map<String, Object> created = Engine.createCase(def, entry);
        if (!Engine.ok(created)) throw new WorkflowException((String) created.get("message"), (Integer) created.get("status"));
        Map<String, Map<String, Object>> tracks = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : Js.map(created.get("tracks")).entrySet()) tracks.put(e.getKey(), Js.map(e.getValue()));
        // An existing application: the legacy columns are the truth for where it is now.
        Map<String, Object> legacy = new LinkedHashMap<>();
        if (body.get("status") instanceof String st) legacy.put("case", st);
        legacy.put("disbursement", body.get("disbursementStatus") instanceof String d && !d.isBlank() ? d : (body.containsKey("status") ? "NOT_STARTED" : null));
        for (Object to : Js.listOrEmpty(def.get("tracks"))) {
            Map<String, Object> t = Js.map(to);
            Object wanted = legacy.get(t.get("key"));
            if (wanted == null) continue;
            Map<String, Object> st = null;
            for (Object so : Js.listOrEmpty(t.get("statuses"))) if (wanted.equals(Js.map(so).get("key"))) st = Js.map(so);
            if (st == null) throw new WorkflowException("Application " + ref + " is in status " + wanted + ", which the workflow does not define.", 400);
            tracks.put((String) t.get("key"), Js.obj("status", st.get("key"), "stage", st.get("stage")));
        }
        return tracks;
    }
}
