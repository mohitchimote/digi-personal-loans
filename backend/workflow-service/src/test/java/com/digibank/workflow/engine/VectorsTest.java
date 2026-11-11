package com.digibank.workflow.engine;

import com.digibank.workflow.engine.Model.Actor;
import com.digibank.workflow.engine.Model.CaseState;
import com.digibank.workflow.engine.Model.Facts;
import com.digibank.workflow.engine.Model.LadderRole;
import com.digibank.workflow.engine.Model.Request;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Runs every conformance vector in workflow-spec/vectors/*.json against the Java engine, reading the
 * repo's own files. The Worker runs the same files (worker/test/workflow-vectors.test.ts); the contract
 * and the matching rules are in workflow-spec/README.md. Nothing is special-cased or weakened.
 */
class VectorsTest {

    static final AtomicInteger RAN = new AtomicInteger();
    static final AtomicInteger PASSED = new AtomicInteger();
    static final List<String> FILES_SEEN = new ArrayList<>();

    @AfterAll
    static void report() {
        System.out.println("=====================================================================");
        System.out.println("WORKFLOW CONFORMANCE VECTORS: ran " + RAN.get() + ", passed " + PASSED.get()
                + " (files: " + FILES_SEEN + ")");
        System.out.println("=====================================================================");
    }

    @Test
    void theSpecDirectoryIsPresentOrTheVectorsAreSkippedLoudly() {
        Path dir = SpecFiles.specDir();
        if (dir == null) System.out.println("!!!!! workflow-spec directory NOT FOUND: conformance vectors NOT RUN !!!!!");
        assumeTrue(dir != null, "workflow-spec directory absent");
        assertTrue(Files.isDirectory(dir.resolve("vectors")));
    }

    @TestFactory
    Stream<DynamicTest> vectors() throws IOException {
        Path dir = SpecFiles.specDir();
        if (dir == null) {
            System.out.println("!!!!! workflow-spec directory NOT FOUND: conformance vectors NOT RUN !!!!!");
            assumeTrue(false, "workflow-spec directory absent");
        }
        Path vectorsDir = dir.resolve("vectors");
        Map<String, Object> fixtures = SpecFiles.read(vectorsDir.resolve("fixtures.json"));
        String now = (String) fixtures.get("now");
        Map<String, Actor> actors = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : Js.map(fixtures.get("actors")).entrySet()) actors.put(e.getKey(), actor(Js.map(e.getValue())));
        List<LadderRole> ladder = new ArrayList<>();
        for (Object l : Js.listOrEmpty(fixtures.get("ladder"))) {
            Map<String, Object> m = Js.map(l);
            ladder.add(new LadderRole((String) m.get("code"), (String) m.get("label"), ((Number) m.get("rank")).intValue()));
        }
        Map<String, Object> defaultFacts = Js.map(fixtures.get("defaultFacts"));
        Map<String, Object> cases = Js.map(fixtures.get("cases"));

        List<Path> files;
        try (Stream<Path> s = Files.list(vectorsDir)) {
            files = s.filter(p -> p.toString().endsWith(".json") && !p.getFileName().toString().equals("fixtures.json")).sorted().toList();
        }
        assertTrue(!files.isEmpty(), "no vector files found");

        List<DynamicTest> tests = new ArrayList<>();
        for (Path file : files) {
            FILES_SEEN.add(file.getFileName().toString());
            Map<String, Object> doc = SpecFiles.read(file);
            Map<String, Object> def = SpecFiles.read(dir.resolve((String) doc.get("definition")));
            for (Object vo : Js.listOrEmpty(doc.get("vectors"))) {
                Map<String, Object> v = Js.map(vo);
                String name = file.getFileName() + " :: " + v.get("name");
                tests.add(DynamicTest.dynamicTest(name, () -> {
                    RAN.incrementAndGet();
                    Facts facts = facts(defaultFacts, Js.map(v.get("facts")), ladder);
                    Object actual = switch ((String) v.get("kind")) {
                        case "create" -> Engine.createCase(def, (String) v.get("entry"));
                        case "queue" -> Engine.queueAccess(def, actors.get((String) v.get("actor")), (String) v.get("queue"));
                        case "actions" -> Engine.allowedActions(def, caseOf(cases, v), actors.get((String) v.get("actor")), facts);
                        case "transition" -> Engine.evaluate(def, caseOf(cases, v),
                                new Request((String) v.get("action"), actors.get((String) v.get("actor")), Js.map(v.get("input")), now), facts);
                        default -> throw new IllegalStateException("unknown vector kind " + v.get("kind"));
                    };
                    assertNull(matches(actual, v.get("expect"), "$"), name);
                    PASSED.incrementAndGet();
                }));
            }
        }
        return tests.stream();
    }

    @SuppressWarnings("unchecked")
    private static CaseState caseOf(Map<String, Object> cases, Map<String, Object> v) {
        Object merged = deepMerge(cases.get((String) v.get("case")), v.get("caseOverrides"));
        Map<String, Object> m = Js.map(merged);
        Map<String, Map<String, Object>> tracks = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : Js.map(m.get("tracks")).entrySet()) tracks.put(e.getKey(), Js.map(e.getValue()));
        return new CaseState(tracks, Js.map(m.get("fields")));
    }

    private static Facts facts(Map<String, Object> defaults, Map<String, Object> over, List<LadderRole> ladder) {
        Map<String, Object> merged = new LinkedHashMap<>(defaults);
        if (over != null) merged.putAll(over);
        Object limit = merged.get("mandateLimit");
        return new Facts((Boolean) merged.get("caseVisible"), (Boolean) merged.get("isOwner"),
                limit == null ? null : ((Number) limit).doubleValue(), ladder);
    }

    private static Actor actor(Map<String, Object> m) {
        List<String> ents = new ArrayList<>();
        for (Object e : Js.listOrEmpty(m.get("entitlements"))) ents.add((String) e);
        Object rank = m.get("rank");
        return new Actor((String) m.get("type"), ((Number) m.get("userId")).longValue(), (String) m.get("name"), (String) m.get("role"),
                rank == null ? null : ((Number) rank).intValue(), new HashSet<>(ents), (String) m.get("scope"));
    }

    private static Object deepMerge(Object base, Object over) {
        if (over == null) return Js.copy(base);
        if (!(over instanceof Map<?, ?>) || !(base instanceof Map<?, ?>)) return over;
        Map<String, Object> out = new LinkedHashMap<>(Js.map(Js.copy(base)));
        for (Map.Entry<String, Object> e : Js.map(over).entrySet()) out.put(e.getKey(), deepMerge(out.get(e.getKey()), e.getValue()));
        return out;
    }

    /** Partial match: every key in expected must equal actual, recursively; arrays match whole, in order. */
    static String matches(Object actual, Object expected, String path) {
        if (expected == null || !(expected instanceof Map<?, ?> || expected instanceof List<?>)) {
            return Js.strictEq(actual, expected) ? null : path + ": expected " + Js.stringify(expected) + ", got " + Js.stringify(actual);
        }
        if (expected instanceof List<?> el) {
            if (!(actual instanceof List<?> al)) return path + ": expected an array, got " + Js.stringify(actual);
            if (al.size() != el.size()) return path + ": expected " + el.size() + " item(s), got " + al.size() + ": " + Js.stringify(actual);
            for (int i = 0; i < el.size(); i++) {
                String r = matches(al.get(i), el.get(i), path + "[" + i + "]");
                if (r != null) return r;
            }
            return null;
        }
        if (!(actual instanceof Map<?, ?> am)) return path + ": expected an object, got " + Js.stringify(actual);
        for (Map.Entry<?, ?> e : ((Map<?, ?>) expected).entrySet()) {
            Object got = am.containsKey(e.getKey()) ? am.get(e.getKey()) : Js.UNDEFINED; // absent is not null
            String r = matches(got, e.getValue(), path + "." + e.getKey());
            if (r != null) return r;
        }
        return null;
    }
}
