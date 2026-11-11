package com.digibank.workflow.service;

import com.digibank.workflow.engine.Catalog;
import com.digibank.workflow.engine.DefinitionValidator;
import com.digibank.workflow.engine.Js;
import com.digibank.workflow.engine.Routing;
import com.digibank.workflow.model.WfDefinition;
import com.digibank.workflow.repository.WfCaseRepository;
import com.digibank.workflow.repository.WfCaseTrackRepository;
import com.digibank.workflow.repository.WfDefinitionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Versioned workflow definitions: DRAFT -> PUBLISHED -> ARCHIVED, the same lifecycle as the form builder
 * (port of the lifecycle half of the Worker's store.ts). One open draft per key keeps the builder simple.
 * A case is pinned to whichever definition was published when it registered, so publishing never changes
 * the rules of a case already in flight. Every save and publish is validated; bad definitions never run.
 */
@Service
public class DefinitionService {

    public static final String DEFAULT_KEY = "loan-origination";

    private final WfDefinitionRepository defs;
    private final WfCaseRepository cases;
    private final WfCaseTrackRepository tracks;

    // PUBLISHED and ARCHIVED definitions are immutable, so parsed copies are cached; DRAFT rows never are.
    private final Map<Long, Map<String, Object>> parsedById = new ConcurrentHashMap<>();

    public DefinitionService(WfDefinitionRepository defs, WfCaseRepository cases, WfCaseTrackRepository tracks) {
        this.defs = defs;
        this.cases = cases;
        this.tracks = tracks;
    }

    public static String now() {
        return Routing.iso(Instant.now());
    }

    public Map<String, Object> parse(WfDefinition row) {
        Map<String, Object> cached = parsedById.get(row.id);
        if (cached != null) return cached;
        Map<String, Object> parsed = Json.parseMap(row.definitionJson);
        if (!"DRAFT".equals(row.status)) parsedById.put(row.id, parsed);
        return parsed;
    }

    public WfDefinition getRow(long id) {
        return defs.findById(id).orElseThrow(() -> new WorkflowException("Workflow definition not found: " + id, 404));
    }

    public WfDefinition publishedRow(String key) {
        List<WfDefinition> rows = defs.findByDefinitionKeyAndStatusOrderByVersionDesc(key, "PUBLISHED");
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** The published default definition. The Flyway migration seeds it; this seeds it from the bundled copy if it is missing. */
    @Transactional
    public WfDefinition ensureDefault() {
        WfDefinition existing = publishedRow(DEFAULT_KEY);
        if (existing != null) return existing;
        String json;
        try (InputStream in = DefinitionService.class.getResourceAsStream("/workflow/loan-origination.v1.json")) {
            json = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Bundled default workflow definition is missing", e);
        }
        Map<String, Object> def = Json.parseMap(json);
        DefinitionValidator.Result r = DefinitionValidator.validate(def, Catalog.ENTITLEMENT_KEYS);
        if (!r.ok()) throw new IllegalStateException("Bundled default workflow definition is invalid: " + String.join("; ", r.errors()));
        WfDefinition row = new WfDefinition();
        row.definitionKey = DEFAULT_KEY;
        row.version = 1;
        row.status = "PUBLISHED";
        row.definitionJson = Json.write(def);
        row.changeNote = "Seeded default definition";
        row.createdAt = now();
        row.createdBy = "system";
        row.publishedAt = row.createdAt;
        row.publishedBy = "system";
        return defs.save(row);
    }

    public Map<String, Object> summary(WfDefinition r) {
        return Js.obj("id", r.id, "key", r.definitionKey, "version", r.version, "status", r.status, "changeNote", r.changeNote,
                "createdAt", r.createdAt, "createdBy", r.createdBy, "publishedAt", r.publishedAt, "publishedBy", r.publishedBy);
    }

    public List<Map<String, Object>> list() {
        ensureDefault();
        Map<Long, Long> counts = new LinkedHashMap<>();
        for (Object[] row : cases.countByDefinition()) counts.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        List<WfDefinition> rows = new ArrayList<>(defs.findAll());
        rows.sort(Comparator.comparing((WfDefinition d) -> d.definitionKey).thenComparing(d -> -d.version));
        List<Map<String, Object>> out = new ArrayList<>();
        for (WfDefinition r : rows) {
            Map<String, Object> m = summary(r);
            m.put("caseCount", counts.getOrDefault(r.id, 0L));
            out.add(m);
        }
        return out;
    }

    /** The result of creating a draft: the row, and whether an open draft already existed. */
    public record DraftResult(WfDefinition row, boolean existing) {}

    @Transactional
    public DraftResult createDraft(String key, Long sourceId, String actor) {
        List<WfDefinition> all = defs.findByDefinitionKey(key);
        if (all.isEmpty()) throw new WorkflowException("Unknown workflow: " + key, 404);
        for (WfDefinition r : all) if ("DRAFT".equals(r.status)) return new DraftResult(r, true);

        WfDefinition source;
        if (sourceId != null) {
            source = all.stream().filter(r -> r.id.equals(sourceId)).findFirst().orElse(null);
            if (source == null) throw new WorkflowException("Source version not found.", 404);
        } else {
            source = all.stream().filter(r -> "PUBLISHED".equals(r.status)).findFirst().orElse(null);
            if (source == null) throw new WorkflowException("Nothing is published to copy from.", 404);
        }
        WfDefinition row = new WfDefinition();
        row.definitionKey = key;
        row.version = all.stream().mapToInt(r -> r.version).max().orElse(0) + 1;
        row.status = "DRAFT";
        row.definitionJson = source.definitionJson;
        row.createdAt = now();
        row.createdBy = actor;
        return new DraftResult(defs.save(row), false);
    }

    /** Either the saved row or the list of validation errors. */
    public record SaveResult(WfDefinition row, List<String> errors) {
        public boolean ok() { return row != null; }
    }

    @Transactional
    public SaveResult saveDraft(long id, Object raw, String changeNote) {
        WfDefinition row = getRow(id);
        if (!"DRAFT".equals(row.status)) throw new WorkflowException("Only a draft can be edited.", 409);
        DefinitionValidator.Result checked = DefinitionValidator.validate(raw, Catalog.ENTITLEMENT_KEYS);
        if (!checked.ok()) return new SaveResult(null, checked.errors());
        Map<String, Object> def = Js.map(raw);
        if (!row.definitionKey.equals(def.get("key"))) return new SaveResult(null, List.of("key: must stay \"" + row.definitionKey + "\""));
        row.definitionJson = Json.write(def);
        row.changeNote = changeNote;
        return new SaveResult(defs.save(row), List.of());
    }

    @Transactional
    public void discardDraft(long id) {
        WfDefinition row = getRow(id);
        if (!"DRAFT".equals(row.status)) throw new WorkflowException("Only a draft can be discarded.", 409);
        defs.delete(row);
    }

    /** Statuses the new definition drops while live cases are still sitting in them: their queues, labels and
     * actions would vanish, so publishing is refused until those cases are moved. */
    private List<String> strandedStatuses(Map<String, Object> previous, Map<String, Object> next) {
        List<String> problems = new ArrayList<>();
        for (Object to : Js.listOrEmpty(previous.get("tracks"))) {
            Map<String, Object> t = Js.map(to);
            Map<String, Object> nextTrack = null;
            for (Object o : Js.listOrEmpty(next.get("tracks"))) if (Js.map(o).get("key").equals(t.get("key"))) nextTrack = Js.map(o);
            for (Object so : Js.listOrEmpty(t.get("statuses"))) {
                String key = (String) Js.map(so).get("key");
                boolean kept = nextTrack != null && Js.listOrEmpty(nextTrack.get("statuses")).stream().anyMatch(n -> key.equals(Js.map(n).get("key")));
                if (kept) continue;
                long n = tracks.countByTrackKeyAndStatus((String) t.get("key"), key);
                if (n > 0) problems.add(t.get("key") + "." + key + " was removed but " + n + " case(s) are still in it");
            }
        }
        return problems;
    }

    @Transactional
    public SaveResult publishDraft(long id, String actor) {
        WfDefinition row = getRow(id);
        if (!"DRAFT".equals(row.status)) throw new WorkflowException("Only a draft can be published.", 409);
        Map<String, Object> def = Json.parseMap(row.definitionJson);
        DefinitionValidator.Result checked = DefinitionValidator.validate(def, Catalog.ENTITLEMENT_KEYS);
        if (!checked.ok()) return new SaveResult(null, checked.errors());

        WfDefinition current = publishedRow(row.definitionKey);
        if (current != null) {
            List<String> stranded = strandedStatuses(parse(current), def);
            if (!stranded.isEmpty()) return new SaveResult(null, stranded);
            current.status = "ARCHIVED";
            defs.save(current);
        }
        row.status = "PUBLISHED";
        row.publishedAt = now();
        row.publishedBy = actor;
        return new SaveResult(defs.save(row), List.of());
    }

    // ---------------------------------------------------------------- runtime projection (UI)

    /** GET /api/workflow/definition: what the screens render from. Includes statuses that only older versions
     * define, so a case pinned to an older version still shows a proper label. */
    public Map<String, Object> projectPublished() {
        WfDefinition published = ensureDefault();
        Map<String, Object> def = parse(published);
        List<WfDefinition> rows = new ArrayList<>(defs.findByDefinitionKeyAndStatusNotOrderByVersion(published.definitionKey, "DRAFT"));
        rows.sort(Comparator.comparingInt(r -> r.version));
        Map<String, Object> statuses = new LinkedHashMap<>();
        for (WfDefinition r : rows) {
            for (Object to : Js.listOrEmpty(parse(r).get("tracks"))) {
                Map<String, Object> t = Js.map(to);
                @SuppressWarnings("unchecked")
                Map<String, Object> bucket = (Map<String, Object>) statuses.computeIfAbsent((String) t.get("key"), k -> new LinkedHashMap<String, Object>());
                for (Object so : Js.listOrEmpty(t.get("statuses"))) {
                    Map<String, Object> s = Js.map(so);
                    bucket.put((String) s.get("key"), Js.obj("label", s.get("label"), "badge", s.get("badge"), "category", s.get("category"), "stage", s.get("stage")));
                }
            }
        }
        Map<String, Object> actions = new LinkedHashMap<>();
        for (Object to : Js.listOrEmpty(def.get("tracks"))) {
            Map<String, Object> t = Js.map(to);
            for (Object xo : Js.listOrEmpty(t.get("transitions"))) {
                Map<String, Object> x = Js.map(xo);
                actions.put((String) x.get("key"), Js.obj("track", t.get("key"), "label", x.get("label"), "from", x.get("from"),
                        "to", x.get("to"), "actors", x.get("actors")));
            }
        }
        return Js.obj("definitionId", published.id, "key", def.get("key"), "version", published.version, "stages", def.get("stages"),
                "statuses", statuses, "queues", def.get("queues"), "actions", actions);
    }

    /** Status keys of the case track whose category is one of the given ones. */
    public List<String> statusesByCategory(List<String> categories) {
        Map<String, Object> def = parse(ensureDefault());
        Map<String, Object> track = null;
        for (Object o : Js.listOrEmpty(def.get("tracks"))) {
            if (track == null) track = Js.map(o);
            if ("case".equals(Js.map(o).get("key"))) track = Js.map(o);
        }
        List<String> out = new ArrayList<>();
        for (Object so : Js.listOrEmpty(track.get("statuses"))) {
            Map<String, Object> s = Js.map(so);
            if (categories.contains(s.get("category"))) out.add((String) s.get("key"));
        }
        return out;
    }
}
