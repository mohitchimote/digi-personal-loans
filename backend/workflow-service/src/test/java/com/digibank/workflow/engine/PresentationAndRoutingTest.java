package com.digibank.workflow.engine;

import com.digibank.workflow.engine.Presentation.ActionInput;
import com.digibank.workflow.engine.Routing.Candidate;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Ports of worker/test/workflow-presentation.test.ts, workflow-audit-policy.test.ts and assignment.test.ts. */
class PresentationAndRoutingTest {

    static final Map<String, Object> DEF = SpecFiles.read(SpecFiles.specDir().resolve("loan-origination.v1.json"));

    static Engine.Found find(String key) {
        Engine.Found f = Engine.findTransition(DEF, key);
        if (f == null) throw new IllegalStateException("no action " + key);
        return f;
    }

    static Map<String, String> inputs(String key) {
        Map<String, String> out = new LinkedHashMap<>();
        for (ActionInput i : Presentation.inputsOf(find(key).transition())) out.put(i.field(), i.kind() + (i.required() ? "!" : ""));
        return out;
    }

    static Map<String, Object> noUi(String key) {
        Map<String, Object> t = new LinkedHashMap<>(find(key).transition());
        t.remove("ui");
        return t;
    }

    // ----------------------------------------------------------- presentation

    @Test
    void requiredInputsComeFromGuards() {
        assertThat(inputs("decline")).containsExactly(Map.entry("reason", "text!"));
    }

    @Test
    void effectsAndConditionsOfferTypedOptionalInputs() {
        assertThat(inputs("send_back")).containsExactly(Map.entry("reason", "text!"), Map.entry("requireGuarantor", "boolean"));
    }

    @Test
    void anActionThatNeedsNothingAsksForNothing() {
        assertThat(inputs("authorise")).isEmpty();
        assertThat(inputs("second_check")).isEmpty();
    }

    @Test
    void doesNotAskForFieldsTheNoteComposerSupplies() {
        assertThat(inputs("add_note").keySet()).doesNotContain("section", "noteType");
    }

    @Test
    void anAmountGuardMakesTheAmountANumberInput() {
        assertThat(inputs("approve").get("approvedAmount")).startsWith("number");
    }

    @Test
    void defaultsToGeneralSecondaryNoIconStay() {
        assertThat(Presentation.resolveUi("case", noUi("add_note")).toJson())
                .isEqualTo(Js.obj("area", "general", "style", "secondary", "icon", null, "after", null));
    }

    @Test
    void disbursementTrackActionsGoToTheDisbursementAreaUnlessTold() {
        assertThat(Presentation.resolveUi("disbursement", noUi("authorise")).area()).isEqualTo("disbursement");
        Map<String, Object> t = noUi("authorise");
        t.put("ui", Js.obj("area", "general"));
        assertThat(Presentation.resolveUi("disbursement", t).area()).isEqualTo("general");
    }

    @Test
    void decisionStyleActionsDefaultToTheDecisionAreaWhenTheDefinitionSaysNothing() {
        for (String k : List.of("approve", "decline", "send_back", "refer")) assertThat(Presentation.resolveUi("case", noUi(k)).area()).as(k).isEqualTo("decision");
        for (String k : List.of("add_note", "request_documents", "approve_conditional", "submit", "withdraw")) {
            assertThat(Presentation.resolveUi("case", noUi(k)).area()).as(k).isEqualTo("general");
        }
    }

    @Test
    void carriesWhatTheDefinitionSets() {
        assertThat(Presentation.resolveUi("case", find("decline").transition()).toJson())
                .isEqualTo(Js.obj("area", "decision", "style", "danger", "icon", "close", "after", "pipeline"));
    }

    // ----------------------------------------------------------- audit policy

    @Test
    void auditsEveryActionThatMovesACase() {
        assertThat(AuditPolicy.auditsEvent("SUBMITTED", "DECLINED", List.of("NOTE"), "STAFF")).isTrue();
        assertThat(AuditPolicy.auditsEvent("DRAFT", "SUBMITTED", List.of(), "CUSTOMER")).isTrue();
        assertThat(AuditPolicy.auditsEvent("UNDER_REVIEW", "APPROVED", List.of(), "SYSTEM")).isTrue();
    }

    @Test
    void doesNotAuditACustomersInPlaceAction() {
        assertThat(AuditPolicy.auditsEvent("IN_PROGRESS", "IN_PROGRESS", List.of(), "CUSTOMER")).isFalse();
    }

    @Test
    void doesNotDoubleCountANoteOnlyAction() {
        assertThat(AuditPolicy.auditsEvent("UNDER_REVIEW", "UNDER_REVIEW", List.of("NOTE"), "STAFF")).isFalse();
    }

    @Test
    void auditsOtherStaffActionsThatChangeNoStatus() {
        assertThat(AuditPolicy.auditsEvent("UNDER_REVIEW", "UNDER_REVIEW", List.of(), "STAFF")).isTrue();
    }

    // ----------------------------------------------------------- assignment

    static Candidate cand(long id, boolean available, int load, String last) {
        return new Candidate(id, "U" + id, "UNDERWRITER", available, load, last);
    }

    static Candidate cand(long id) { return cand(id, true, 0, null); }

    @Test
    void manualNeverPicksAnyone() {
        assertThat(Routing.chooseAssignee(List.of(cand(1)), "MANUAL")).isNull();
    }

    @Test
    void returnsNullWhenNobodyIsAvailable() {
        assertThat(Routing.chooseAssignee(List.of(cand(1, false, 0, null)), "ROUND_ROBIN")).isNull();
        assertThat(Routing.chooseAssignee(List.of(), "LEAST_LOADED")).isNull();
    }

    @Test
    void roundRobinPicksWhoeverWasAssignedLongestAgoNeverAssignedFirst() {
        assertThat(Routing.chooseAssignee(List.of(cand(1, true, 0, "2026-01-02T00:00:00Z"), cand(2, true, 0, "2026-01-01T00:00:00Z"),
                cand(3, true, 0, "2026-01-03T00:00:00Z")), "ROUND_ROBIN").userId()).isEqualTo(2);
        assertThat(Routing.chooseAssignee(List.of(cand(1, true, 0, "2026-01-02T00:00:00Z"), cand(9)), "ROUND_ROBIN").userId()).isEqualTo(9);
    }

    @Test
    void roundRobinSkipsUnavailableStaffEvenIfTheyWaitedLongest() {
        assertThat(Routing.chooseAssignee(List.of(cand(1, false, 0, null), cand(2, true, 0, "2026-01-05T00:00:00Z")), "ROUND_ROBIN").userId()).isEqualTo(2);
    }

    @Test
    void leastLoadedPicksTheFewestOpenCasesTiesGoToTheLongestWaitThenTheLowestId() {
        assertThat(Routing.chooseAssignee(List.of(cand(1, true, 3, null), cand(2, true, 1, null), cand(3, true, 2, null)), "LEAST_LOADED").userId()).isEqualTo(2);
        assertThat(Routing.chooseAssignee(List.of(cand(1, true, 1, "2026-01-02T00:00:00Z"), cand(2, true, 1, "2026-01-01T00:00:00Z")), "LEAST_LOADED").userId()).isEqualTo(2);
        assertThat(Routing.chooseAssignee(List.of(cand(5), cand(4)), "LEAST_LOADED").userId()).isEqualTo(4);
    }

    // ----------------------------------------------------------- SLA

    static final Map<String, Object> STAGE = Js.obj("key", "REVIEW", "label", Js.obj("en", "R", "he", "R"), "sla", Js.obj("hours", 10, "amberAtPercent", 80));
    static final String ENTERED = "2026-01-01T00:00:00Z";

    static Instant at(double hours) { return Instant.parse(ENTERED).plusMillis((long) (hours * 3_600_000)); }

    @Test
    void slaIsGreenEarlyAmberFromTheThresholdRedOnceTheAllowanceIsUsed() {
        assertThat(Routing.slaStatus(STAGE, ENTERED, at(7.9), false).state()).isEqualTo("GREEN");
        assertThat(Routing.slaStatus(STAGE, ENTERED, at(8), false).state()).isEqualTo("AMBER");
        assertThat(Routing.slaStatus(STAGE, ENTERED, at(9.99), false).state()).isEqualTo("AMBER");
        assertThat(Routing.slaStatus(STAGE, ENTERED, at(10), false).state()).isEqualTo("RED");
    }

    @Test
    void slaReportsTheDueTimeAndPercentUsed() {
        var s = Routing.slaStatus(STAGE, ENTERED, at(5), false);
        assertThat(s.dueAt()).isEqualTo("2026-01-01T10:00:00.000Z");
        assertThat(s.percentUsed()).isEqualTo(50L);
    }

    @Test
    void slaDefaultsAmberToSeventyFivePercent() {
        Map<String, Object> s = Js.obj("key", "X", "label", Js.obj("en", "X", "he", "X"), "sla", Js.obj("hours", 4));
        assertThat(Routing.slaStatus(s, ENTERED, at(2.9), false).state()).isEqualTo("GREEN");
        assertThat(Routing.slaStatus(s, ENTERED, at(3), false).state()).isEqualTo("AMBER");
    }

    @Test
    void noClockWithoutAnSlaForClosedCasesOrABadDate() {
        assertThat(Routing.slaStatus(Js.obj("key", "X", "label", Js.obj("en", "X", "he", "X")), ENTERED, at(100), false).state()).isEqualTo("NONE");
        assertThat(Routing.slaStatus(STAGE, ENTERED, at(100), true).state()).isEqualTo("NONE");
        assertThat(Routing.slaStatus(STAGE, "nonsense", at(1), false).state()).isEqualTo("NONE");
        assertThat(Routing.slaStatus(null, ENTERED, at(1), false).state()).isEqualTo("NONE");
    }
}
