package com.digibank.workflow.engine;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Port of worker/test/workflow-validate.test.ts and the routing-in-definitions part of assignment.test.ts. */
class DefinitionValidatorTest {

    static Map<String, Object> base() {
        return SpecFiles.copy(SpecFiles.read(SpecFiles.specDir().resolve("loan-origination.v1.json")));
    }

    static List<String> errorsOf(Object d) {
        return DefinitionValidator.validate(d, Catalog.ENTITLEMENT_KEYS).errors();
    }

    static Map<String, Object> track(Map<String, Object> d, int i) { return Js.map(Js.list(d.get("tracks")).get(i)); }

    static Map<String, Object> transition(Map<String, Object> d, int track, int idx) {
        return Js.map(Js.list(track(d, track).get("transitions")).get(idx));
    }

    static Map<String, Object> byKey(Map<String, Object> d, String key) {
        for (Object t : Js.list(d.get("tracks"))) for (Object x : Js.list(Js.map(t).get("transitions"))) {
            if (key.equals(Js.map(x).get("key"))) return Js.map(x);
        }
        throw new IllegalStateException(key);
    }

    @Test
    void acceptsTheDefaultDefinition() {
        assertThat(errorsOf(base())).isEmpty();
    }

    @Test
    void rejectsUnknownTopLevelKeys() {
        var d = base(); d.put("surprise", 1);
        assertThat(errorsOf(d)).isNotEmpty();
    }

    @Test
    void rejectsAnUnknownGuardType() {
        var d = base();
        Js.list(transition(d, 0, 0).get("guards")).add(Js.obj("type", "MAGIC"));
        assertThat(errorsOf(d)).isNotEmpty();
    }

    @Test
    void rejectsATransitionToAnUnknownStatus() {
        var d = base(); byKey(d, "decline").put("to", "NOPE");
        assertThat(String.join("\n", errorsOf(d))).containsPattern("decline: unknown target status NOPE");
    }

    @Test
    void rejectsAnEntitlementNotInTheCatalog() {
        var d = base(); byKey(d, "send_back").put("entitlement", "case.fly");
        assertThat(String.join("\n", errorsOf(d))).containsPattern("entitlement case.fly is not in the catalog");
    }

    @Test
    void rejectsAStaffOnlyTransitionWithNoEntitlement() {
        var d = base(); byKey(d, "decline").remove("entitlement");
        assertThat(String.join("\n", errorsOf(d))).contains("staff-only transition needs an entitlement");
    }

    @Test
    void rejectsAnUnreachableStatus() {
        var d = base();
        Js.list(track(d, 0).get("statuses")).add(Js.obj("key", "ORPHAN", "stage", "INTAKE", "category", "ACTIVE", "badge", "draft",
                "label", Js.obj("en", "x", "he", "x")));
        assertThat(String.join("\n", errorsOf(d))).contains("case.ORPHAN: status is unreachable");
    }

    @Test
    void rejectsAQueueWithAnUnknownStatus() {
        var d = base();
        Js.list(Js.map(Js.list(d.get("queues")).get(0)).get("statuses")).add("GHOST");
        assertThat(String.join("\n", errorsOf(d))).contains("queue pipeline: unknown status GHOST");
    }

    @Test
    void rejectsTargetTemplatesWithoutAReferralTargetGuard() {
        var d = base();
        Js.list(byKey(d, "add_note").get("effects")).add(Js.obj("type", "NOTE", "noteType", "X", "section", "g", "text", "{{target.code}}"));
        assertThat(String.join("\n", errorsOf(d))).contains("add_note: uses target.* without a REFERRAL_TARGET guard");
    }

    @Test
    void rejectsAGuardThatPointsAtAnUnknownTrackOrStatus() {
        var d = base();
        Js.list(transition(d, 1, 0).get("guards")).add(Js.obj("type", "TRACK_STATUS_IS", "track", "ghost", "statuses", List.of("X")));
        Js.list(transition(d, 1, 1).get("guards")).add(Js.obj("type", "TRACK_STATUS_IS", "track", "case", "statuses", List.of("NOPE")));
        String e = String.join("\n", errorsOf(d));
        assertThat(e).contains("unknown track ghost").contains("unknown status case.NOPE");
    }

    @Test
    void rejectsDuplicateTransitionKeysAcrossTracks() {
        var d = base(); transition(d, 1, 0).put("key", "approve");
        assertThat(String.join("\n", errorsOf(d))).contains("Duplicate transition key");
    }

    @Test
    void rejectsTwoActionsThatEmitTheSameEventAndMalformedEventNames() {
        var d = base();
        transition(d, 1, 0).put("event", "case.approved");
        transition(d, 1, 1).put("event", "case.approved");
        assertThat(String.join(";", errorsOf(d))).contains("Duplicate event");
        transition(d, 1, 1).put("event", "Not An Event");
        assertThat(String.join(";", errorsOf(d))).isNotEmpty();
    }

    @Test
    void rejectsAnActionWhoseDefaultEventNameWouldBeInvalidUnlessItSetsAnExplicitOne() {
        var d = base();
        transition(d, 1, 0).put("key", "Approve-Early");
        transition(d, 1, 0).remove("event");
        assertThat(String.join(";", errorsOf(d))).containsPattern("default event .* is not a valid event name");
        transition(d, 1, 0).put("event", "disbursement.approvedEarly");
        assertThat(String.join(";", errorsOf(d))).doesNotContain("default event");
    }

    @Test
    void acceptsAUiBlockAndRejectsUnknownAreasStylesIconsAndStrayKeys() {
        var d = base();
        transition(d, 1, 0).put("ui", Js.obj("area", "decision", "style", "danger", "icon", "close", "after", "pipeline"));
        assertThat(errorsOf(d)).isEmpty();
        for (Map<String, Object> bad : List.<Map<String, Object>>of(Js.obj("area", "sidebar"), Js.obj("style", "loud"),
                Js.obj("icon", "Not An Icon"), Js.obj("after", "home"), Js.obj("colour", "red"))) {
            transition(d, 1, 0).put("ui", bad);
            assertThat(String.join(";", errorsOf(d))).as(Js.stringify(bad)).isNotEmpty();
        }
    }

    @Test
    void rejectsATrackWithNoWayToStart() {
        var d = base(); track(d, 1).remove("initialStatus");
        assertThat(String.join("\n", errorsOf(d))).contains("needs an entry point or an initialStatus");
    }

    @Test
    void acceptsEveryRoutingModeAndRejectsAnUnknownOne() {
        for (String mode : List.of("MANUAL", "ROUND_ROBIN", "LEAST_LOADED")) {
            var d = base();
            Js.map(Js.list(d.get("stages")).get(1)).put("routing", Js.obj("mode", mode));
            assertThat(errorsOf(d)).as(mode).isEmpty();
        }
        var bad = base();
        Js.map(Js.list(bad.get("stages")).get(1)).put("routing", Js.obj("mode", "RANDOM"));
        assertThat(errorsOf(bad)).isNotEmpty();
    }

    @Test
    void theDefinitionCopiedIntoTheModuleResourcesIsIdenticalToTheSpecFile() throws Exception {
        var spec = java.nio.file.Files.readString(SpecFiles.specDir().resolve("loan-origination.v1.json"));
        try (var in = DefinitionValidatorTest.class.getResourceAsStream("/workflow/loan-origination.v1.json")) {
            var bundled = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            // Same bytes up to line endings: git may check the two copies out with different ones.
            assertThat(bundled.replace("\r\n", "\n")).isEqualTo(spec.replace("\r\n", "\n"));
        }
    }

    @Test
    void theEntitlementCatalogMatchesTheWorkersCatalog() throws Exception {
        var worker = java.nio.file.Files.readString(SpecFiles.specDir().resolve("../worker/src/lib/entitlements.ts"));
        var m = java.util.regex.Pattern.compile("\\{ key: \"([^\"]+)\"").matcher(worker);
        var keys = new java.util.ArrayList<String>();
        while (m.find()) keys.add(m.group(1));
        assertThat(Catalog.ENTITLEMENT_KEYS).containsExactlyElementsOf(keys);
    }
}
