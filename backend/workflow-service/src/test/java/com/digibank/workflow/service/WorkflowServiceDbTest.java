package com.digibank.workflow.service;

import com.digibank.workflow.engine.Js;
import com.digibank.workflow.engine.Model.Actor;
import com.digibank.workflow.model.WfDefinition;
import com.digibank.workflow.repository.WfCaseTrackRepository;
import com.digibank.workflow.repository.WfDefinitionRepository;
import com.digibank.workflow.repository.WfReferralRepository;
import com.digibank.workflow.repository.WfTransitionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The service layer against a real schema: Flyway migrations (including the seeding migration) run on H2 in MySQL mode, the
 * mappings are validated against them, and the guards, pinning, routing, ownership and SLA behaviour are exercised end to end
 * through the services. MySQL itself is covered by the one-off run described in the module README.
 */
@DataJpaTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:wf;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa", "spring.datasource.password=",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.flyway.enabled=true",
        "eureka.client.enabled=false", "spring.cloud.discovery.enabled=false",
        "app.jwt.secret=x", "app.auth-service.url=http://localhost:1", "app.rule-service.url=http://localhost:1"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({DefinitionService.class, CaseService.class, AssignmentService.class, TransitionService.class, Visibility.class, TestDirectory.Config.class})
class WorkflowServiceDbTest {

    @Autowired DefinitionService definitions;
    @Autowired CaseService cases;
    @Autowired AssignmentService assignment;
    @Autowired TransitionService transitions;
    @Autowired TestDirectory dir;
    @Autowired WfTransitionRepository transitionRows;
    @Autowired WfReferralRepository referralRows;
    @Autowired WfCaseTrackRepository trackRows;
    @Autowired WfDefinitionRepository definitionRows;
    @Autowired JdbcTemplate jdbc;

    static final Set<String> UW = Set.of("portal.underwriter", "queue.pipeline", "case.addNote", "case.approve", "case.decline", "case.sendBack",
            "case.refer", "case.disburse", "case.disburseSecondCheck");

    static Caller staff(long id, String role, Integer rank, Set<String> ents) {
        return new Caller(new Actor("STAFF", id, "Staff " + id, role, rank, ents, "ALL"), null);
    }

    static Caller underwriter() { return staff(1, "UNDERWRITER", 1, UW); }

    static Caller senior() { return staff(5, "SENIOR_UNDERWRITER", 2, UW); }

    static Caller customer(long id) { return new Caller(new Actor("CUSTOMER", id, "Customer " + id, "CUSTOMER", null, Set.of(), "ALL"), null); }

    @BeforeEach
    void reset() { dir.reset(); }

    Map<String, Object> register(String ref, String status, Object... extra) {
        Map<String, Object> body = Js.obj("applicationType", "PERSONAL", "orgUnitId", 3, "customerId", 7, "applicantName", "Dana Customer",
                "amount", 50000, "purpose", "CAR", "termMonths", 36, "status", status, "currentSection", "reviewSubmit");
        for (int i = 0; i < extra.length; i += 2) body.put((String) extra[i], extra[i + 1]);
        return cases.register(ref, body).loaded().tracks().get("case");
    }

    Map<String, Object> run(String ref, Caller who, String action, Map<String, Object> input) {
        return transitions.run(ref, who, action, input, null, true, null);
    }

    String statusOf(String ref) { return (String) cases.load(ref).tracks().get("case").get("status"); }

    // ---------------------------------------------------------------- migrations and definitions

    @Test
    void flywayBuiltTheSchemaAndSeededTheDefaultPublishedDefinition() {
        Integer applied = jdbc.queryForObject("select count(*) from flyway_schema_history where success = true and version is not null", Integer.class);
        assertThat(applied).isEqualTo(2);
        WfDefinition row = definitions.ensureDefault();
        assertThat(row.status).isEqualTo("PUBLISHED");
        assertThat(row.version).isEqualTo(1);
        assertThat(row.createdBy).isEqualTo("system");
        assertThat(Js.list(definitions.parse(row).get("tracks"))).hasSize(2);
        assertThat(definitions.list()).extracting(m -> m.get("caseCount")).containsExactly(0L);
    }

    @Test
    void definitionLifecycleDraftSaveValidatePublishArchive() {
        long v1 = definitions.ensureDefault().id;
        var draft = definitions.createDraft("loan-origination", null, "admin");
        assertThat(draft.existing()).isFalse();
        assertThat(draft.row().version).isEqualTo(2);
        assertThat(definitions.createDraft("loan-origination", null, "admin").existing()).isTrue(); // one open draft per key

        Map<String, Object> def = Json.parseMap(draft.row().definitionJson);
        Js.map(Js.list(def.get("stages")).get(0)).put("surprise", true);
        var bad = definitions.saveDraft(draft.row().id, def, "oops");
        assertThat(bad.ok()).isFalse();
        assertThat(bad.errors()).isNotEmpty();

        Js.map(Js.list(def.get("stages")).get(0)).remove("surprise");
        assertThat(definitions.saveDraft(draft.row().id, def, "no-op").ok()).isTrue();
        var published = definitions.publishDraft(draft.row().id, "admin");
        assertThat(published.ok()).isTrue();
        assertThat(definitions.getRow(v1).status).isEqualTo("ARCHIVED");
        assertThat(definitions.publishedRow("loan-origination").version).isEqualTo(2);
        assertThatThrownBy(() -> definitions.publishDraft(published.row().id, "admin")).isInstanceOf(WorkflowException.class).hasMessageContaining("Only a draft");
        assertThatThrownBy(() -> definitions.discardDraft(published.row().id)).isInstanceOf(WorkflowException.class);
    }

    @Test
    void aDraftCannotChangeItsKeyAndCanBeDiscarded() {
        var draft = definitions.createDraft("loan-origination", null, "admin");
        Map<String, Object> def = Json.parseMap(draft.row().definitionJson);
        def.put("key", "other");
        assertThat(definitions.saveDraft(draft.row().id, def, null).errors()).anyMatch(e -> e.contains("must stay"));
        definitions.discardDraft(draft.row().id);
        assertThat(definitionRows.findById(draft.row().id)).isEmpty();
    }

    @Test
    void publishingIsRefusedWhileLiveCasesSitInAStatusTheNewVersionDrops() {
        register("A-1", "SUBMITTED");
        var draft = definitions.createDraft("loan-origination", null, "admin");
        Map<String, Object> def = Json.parseMap(draft.row().definitionJson);
        Map<String, Object> caseTrack = Js.map(Js.list(def.get("tracks")).get(0));
        // Drop SUBMITTED everywhere it is referenced so the draft itself is valid; only the live case blocks publishing.
        Js.list(caseTrack.get("statuses")).removeIf(s -> "SUBMITTED".equals(Js.map(s).get("key")));
        for (Object t : Js.list(caseTrack.get("transitions"))) {
            Js.list(Js.map(t).get("from")).remove("SUBMITTED");
            if ("SUBMITTED".equals(Js.map(t).get("to"))) Js.map(t).put("to", "UNDER_REVIEW");
        }
        for (Object q : Js.list(def.get("queues"))) Js.list(Js.map(q).get("statuses")).remove("SUBMITTED");
        assertThat(definitions.saveDraft(draft.row().id, def, null).errors()).isEmpty();
        var r = definitions.publishDraft(draft.row().id, "admin");
        assertThat(r.ok()).isFalse();
        assertThat(r.errors()).containsExactly("case.SUBMITTED was removed but 1 case(s) are still in it");
    }

    // ---------------------------------------------------------------- registration

    @Test
    void registeringIsIdempotentAndNeverMovesTheTrackState() {
        assertThat(cases.register("A-2", Js.obj("status", "UNDER_REVIEW", "orgUnitId", 3, "customerId", 7)).created()).isTrue();
        run("A-2", underwriter(), "approve", Js.obj("approvedAmount", 1000));
        var again = cases.register("A-2", Js.obj("status", "UNDER_REVIEW", "amount", 1234));
        assertThat(again.created()).isFalse();
        assertThat(statusOf("A-2")).isEqualTo("APPROVED");
        assertThat(again.loaded().summary().amount).isEqualTo(1234.0);
        assertThat(again.loaded().summary().orgUnitId).isEqualTo(3L); // fields absent from the body are left alone
    }

    @Test
    void anApplicationInAStatusTheWorkflowDoesNotDefineIsRejected() {
        assertThatThrownBy(() -> cases.register("A-3", Js.obj("status", "MYSTERY"))).isInstanceOf(WorkflowException.class)
                .hasMessageContaining("which the workflow does not define");
    }

    @Test
    void aNewCaseStartsAtTheEntryPointAndABackfilledOneKeepsItsDisbursementStatus() {
        var fresh = cases.register("A-4", Js.obj("entry", "start")).loaded();
        assertThat(fresh.tracks().get("case").get("status")).isEqualTo("DRAFT");
        assertThat(fresh.tracks().get("disbursement").get("status")).isEqualTo("NOT_STARTED");
        var old = cases.register("A-5", Js.obj("status", "APPROVED", "disbursementStatus", "SECOND_CHECK_PENDING", "enteredAt", "2026-01-01T00:00:00.000Z")).loaded();
        assertThat(old.tracks().get("disbursement")).isEqualTo(Js.obj("status", "SECOND_CHECK_PENDING", "stage", "DISBURSEMENT"));
        assertThat(old.rows().get("case").enteredAt).isEqualTo("2026-01-01T00:00:00.000Z");
    }

    // ---------------------------------------------------------------- guards, through the real persistence path

    @Test
    void approvingWithinMandateMovesTheCaseLogsItAndReturnsTheHostEffects() {
        register("B-1", "UNDER_REVIEW");
        Map<String, Object> r = run("B-1", underwriter(), "approve", Js.obj("approvedAmount", 50000));
        assertThat(r.get("ok")).isEqualTo(true);
        assertThat(r.get("event")).isEqualTo("case.approved");
        assertThat(Js.map(r.get("mirror"))).containsEntry("status", "APPROVED");
        assertThat(Js.map(r.get("audit"))).containsEntry("write", true).containsEntry("eventType", "case.approved");
        assertThat(Js.listOrEmpty(r.get("hostEffects"))).extracting(e -> Js.map(e).get("type")).containsExactly("NOTE", "NOTIFY", "EMAIL", "GENERATE_DOC");
        assertThat(Js.map(r.get("fieldUpdates"))).containsEntry("approvedAmount", 50000);

        assertThat(statusOf("B-1")).isEqualTo("APPROVED");
        assertThat(cases.load("B-1").summary().approvedAmount).isEqualTo(50000.0);
        var log = transitionRows.findByApplicationRefOrderById("B-1");
        assertThat(log).hasSize(1);
        assertThat(log.get(0).action).isEqualTo("approve");
        assertThat(log.get(0).fromStatus).isEqualTo("UNDER_REVIEW");
        assertThat(log.get(0).toStage).isEqualTo("APPROVAL");
    }

    @Test
    void approvingOverTheMandateIsRefusedAndNothingChanges() {
        register("B-2", "UNDER_REVIEW");
        Map<String, Object> r = run("B-2", underwriter(), "approve", Js.obj("approvedAmount", 150000));
        assertThat(r).containsEntry("ok", false).containsEntry("status", 403).containsEntry("code", "OVER_MANDATE");
        assertThat(statusOf("B-2")).isEqualTo("UNDER_REVIEW");
        assertThat(transitionRows.findByApplicationRefOrderById("B-2")).isEmpty();
    }

    @Test
    void aRoleWithNoMandateRowHasNoApprovalAuthority() {
        register("B-3", "UNDER_REVIEW");
        dir.limits.remove("UNDERWRITER");
        assertThat(run("B-3", underwriter(), "approve", Js.obj("approvedAmount", 1))).containsEntry("code", "OVER_MANDATE");
    }

    @Test
    void anActionNeedsItsEntitlementNotARoleName() {
        register("B-4", "UNDER_REVIEW");
        Caller noDecline = staff(1, "UNDERWRITER", 1, Set.of("queue.pipeline", "case.approve"));
        assertThat(run("B-4", noDecline, "decline", Js.obj("reason", "no"))).containsEntry("status", 403).containsEntry("code", "MISSING_ENTITLEMENT");
        // a role the admin invented works if it holds the entitlement
        Caller custom = staff(2, "BRANCH_OFFICER", null, Set.of("case.decline"));
        assertThat(run("B-4", custom, "decline", Js.obj("reason", "no"))).containsEntry("ok", true);
        assertThat(statusOf("B-4")).isEqualTo("DECLINED");
    }

    @Test
    void aCaseReferredUpIsLockedToTheTargetLevelAndAbove() {
        register("B-5", "REFERRED_TO_SENIOR", "referredToRole", "SENIOR_UNDERWRITER");
        Map<String, Object> locked = run("B-5", underwriter(), "approve", Js.obj("approvedAmount", 1000));
        assertThat(locked).containsEntry("status", 403).containsEntry("code", "REFERRAL_LOCKED");
        assertThat(statusOf("B-5")).isEqualTo("REFERRED_TO_SENIOR");

        Map<String, Object> ok = run("B-5", senior(), "approve", Js.obj("approvedAmount", 1000));
        assertThat(ok).containsEntry("ok", true);
        assertThat(cases.load("B-5").summary().referredToRole).isNull();
    }

    @Test
    void referringOpensAReferralRowAndApprovingClosesIt() {
        register("B-6", "UNDER_REVIEW");
        Map<String, Object> r = run("B-6", underwriter(), "refer", Js.obj("reason", "needs a senior"));
        assertThat(r).containsEntry("ok", true);
        assertThat(cases.load("B-6").summary().referredToRole).isEqualTo("SENIOR_UNDERWRITER");
        var open = referralRows.findByApplicationRefAndResolvedAtIsNull("B-6");
        assertThat(open).hasSize(1);
        assertThat(open.get(0).toRole).isEqualTo("SENIOR_UNDERWRITER");
        assertThat(open.get(0).fromName).isEqualTo("Staff 1");

        run("B-6", senior(), "approve", Js.obj("approvedAmount", 1000));
        assertThat(referralRows.findByApplicationRefAndResolvedAtIsNull("B-6")).isEmpty();
        assertThat(referralRows.findByApplicationRefOrderById("B-6")).hasSize(1).allMatch(x -> x.resolvedAt != null);
    }

    @Test
    void onlyTheOwnerOrAssistingStaffMayActOnACustomersCase() {
        register("B-7", "SUBMITTED");
        assertThat(run("B-7", customer(8), "withdraw", Map.of())).containsEntry("status", 403).containsEntry("code", "NOT_OWNER");
        assertThat(run("B-7", staff(1, "UNDERWRITER", 1, UW), "withdraw", Map.of())).containsEntry("code", "NOT_OWNER"); // no case.actAsCustomer
        assertThat(statusOf("B-7")).isEqualTo("SUBMITTED");
        assertThat(run("B-7", customer(7), "withdraw", Map.of())).containsEntry("ok", true);
        assertThat(statusOf("B-7")).isEqualTo("IN_PROGRESS");
    }

    @Test
    void aStateConflictIsA409AndAnUnregisteredCaseIsA404() {
        register("B-8", "DECLINED");
        assertThat(run("B-8", underwriter(), "approve", Js.obj("approvedAmount", 1))).containsEntry("status", 409).containsEntry("code", "INVALID_STATE");
        assertThat(run("NOPE", underwriter(), "approve", Js.obj("approvedAmount", 1))).containsEntry("status", 404).containsEntry("code", "CASE_NOT_REGISTERED");
    }

    @Test
    void aDryRunEvaluatesWithoutPersistingAnything() {
        register("B-9", "UNDER_REVIEW");
        Map<String, Object> r = transitions.run("B-9", underwriter(), "decline", Js.obj("reason", "x"), null, false, null);
        assertThat(r).containsEntry("ok", true).containsEntry("committed", false);
        assertThat(statusOf("B-9")).isEqualTo("UNDER_REVIEW");
        assertThat(transitionRows.findByApplicationRefOrderById("B-9")).isEmpty();
    }

    @Test
    void theHostCanOverrideTheCaseFieldsItOwns() {
        register("B-10", "SUBMITTED");
        // application-service knows a guarantor is on file: the send-back must not send the customer to guarantorDetails
        Map<String, Object> r = transitions.run("B-10", underwriter(), "send_back", Js.obj("reason", "r", "requireGuarantor", true),
                Js.obj("guarantorDetailsPresent", true), true, null);
        assertThat(Js.map(r.get("fieldUpdates"))).containsEntry("currentSection", "reviewSubmit");
    }

    @Test
    void aRepeatedIdempotencyKeyReplaysTheFirstAnswerWithoutActingTwice() {
        register("B-11", "UNDER_REVIEW");
        Map<String, Object> first = transitions.run("B-11", underwriter(), "approve", Js.obj("approvedAmount", 1000), null, true, "key-1");
        Map<String, Object> second = transitions.run("B-11", underwriter(), "approve", Js.obj("approvedAmount", 1000), null, true, "key-1");
        assertThat(first).containsEntry("replayed", false);
        assertThat(second).containsEntry("replayed", true).containsEntry("ok", true);
        assertThat(transitionRows.findByApplicationRefOrderById("B-11")).hasSize(1);
        // without the key the second approve would be an INVALID_STATE conflict: the replay is what made it succeed
        assertThat(run("B-11", underwriter(), "approve", Js.obj("approvedAmount", 1000))).containsEntry("code", "INVALID_STATE");
        register("B-12", "UNDER_REVIEW");
        assertThatThrownBy(() -> transitions.run("B-12", underwriter(), "approve", Js.obj("approvedAmount", 1000), null, true, "key-1"))
                .isInstanceOf(WorkflowException.class).hasMessageContaining("another case");
    }

    @Test
    void theDisbursementTrackMovesIndependentlyOfTheCaseTrack() {
        register("B-13", "APPROVED", "approvedAmount", 50000);
        Map<String, Object> r = run("B-13", underwriter(), "authorise", Map.of());
        assertThat(r).containsEntry("ok", true);
        assertThat(Js.map(r.get("mirror"))).containsEntry("disbursementStatus", "FUNDS_RELEASED").doesNotContainKey("status");
        assertThat(cases.load("B-13").summary().disbursementStatus).isEqualTo("FUNDS_RELEASED");
        assertThat(statusOf("B-13")).isEqualTo("APPROVED");
        assertThat(run("B-13", underwriter(), "authorise", Map.of())).containsEntry("code", "INVALID_STATE"); // funds cannot be released twice
    }

    // ---------------------------------------------------------------- pinned versions

    private void publishWith(java.util.function.Consumer<Map<String, Object>> edit) {
        var draft = definitions.createDraft("loan-origination", null, "admin");
        Map<String, Object> def = Json.parseMap(draft.row().definitionJson);
        edit.accept(def);
        assertThat(definitions.saveDraft(draft.row().id, def, "test").errors()).isEmpty();
        assertThat(definitions.publishDraft(draft.row().id, "admin").ok()).isTrue();
    }

    static Map<String, Object> action(Map<String, Object> def, String key) {
        for (Object t : Js.list(def.get("tracks"))) for (Object x : Js.list(Js.map(t).get("transitions"))) if (key.equals(Js.map(x).get("key"))) return Js.map(x);
        throw new IllegalStateException(key);
    }

    @Test
    void aCaseStaysPinnedToTheVersionItStartedOnAndNewCasesFollowTheNewOne() {
        register("C-1", "UNDER_REVIEW");
        long v1 = cases.load("C-1").wfCase().definitionId;
        // v2 makes decline need a different entitlement
        publishWith(def -> action(def, "decline").put("entitlement", "case.sendBack"));
        register("C-2", "UNDER_REVIEW");
        long v2 = cases.load("C-2").wfCase().definitionId;
        assertThat(v2).isNotEqualTo(v1);

        Caller onlyDecline = staff(3, "UNDERWRITER", 1, Set.of("case.decline"));
        assertThat(run("C-2", onlyDecline, "decline", Js.obj("reason", "x"))).containsEntry("code", "MISSING_ENTITLEMENT"); // new version
        assertThat(run("C-1", onlyDecline, "decline", Js.obj("reason", "x"))).containsEntry("ok", true);                      // pinned to v1
        assertThat(cases.load("C-1").wfCase().definitionId).isEqualTo(v1);
        assertThat(definitions.list()).filteredOn(m -> m.get("id").equals(v1)).extracting(m -> m.get("caseCount")).containsExactly(1L);
    }

    // ---------------------------------------------------------------- routing on stage entry

    @Test
    void enteringAnAutoRoutedStageHandsTheCaseToTheNextEligibleAvailablePerson() {
        publishWith(def -> {
            Map<String, Object> approval = Js.map(Js.list(def.get("stages")).get(2));
            approval.put("owner", Js.obj("roles", List.of("UNDERWRITER", "SENIOR_UNDERWRITER"), "unitRule", "ANY"));
            approval.put("routing", Js.obj("mode", "LEAST_LOADED"));
        });
        dir.addStaff(11, "Una", "UNDERWRITER", 3L, true).addStaff(12, "Away", "UNDERWRITER", 3L, false).addStaff(13, "Sam", "SENIOR_UNDERWRITER", 3L, true);
        register("D-1", "UNDER_REVIEW");
        Map<String, Object> r = run("D-1", underwriter(), "approve", Js.obj("approvedAmount", 1000));
        assertThat(Js.map(r.get("routed"))).containsEntry("userId", 11L).containsEntry("stage", "APPROVAL");
        assertThat(assignment.info("D-1")).containsEntry("assigneeUserId", 11L).containsEntry("assigneeName", "Una");
        assertThat(dir.audits).anyMatch(a -> a.startsWith("CASE_AUTO_ASSIGNED|D-1"));

        // a second case: Una now carries one open case, so Sam (never assigned, load 0) is next
        register("D-2", "UNDER_REVIEW");
        assertThat(Js.map(run("D-2", underwriter(), "approve", Js.obj("approvedAmount", 1000)).get("routed"))).containsEntry("userId", 13L);
    }

    @Test
    void aStatusChangeInsideAStageKeepsTheOwnerButAStageChangeDropsIt() {
        register("D-3", "SUBMITTED");
        Caller una = staff(1, "UNDERWRITER", 1, UW);
        dir.addStaff(1, "Staff 1", "UNDERWRITER", 3L, true);
        assignment.claim(una, "D-3");
        assertThat(assignment.info("D-3")).containsEntry("assigneeUserId", 1L);
        run("D-3", underwriter(), "select_product", Map.of()); // SUBMITTED -> UNDER_REVIEW, same stage: but select_product needs OWNER_OR_ASSISTING
        assertThat(assignment.info("D-3")).containsEntry("assigneeUserId", 1L);
        run("D-3", underwriter(), "approve", Js.obj("approvedAmount", 1000));  // REVIEW -> APPROVAL: a different stage
        assertThat(assignment.info("D-3")).containsEntry("assigneeUserId", null);
    }

    // ---------------------------------------------------------------- ownership operations

    @Test
    void claimAssignAndReleaseFollowTheOwnershipRules() {
        dir.addStaff(1, "Una", "UNDERWRITER", 3L, true).addStaff(5, "Sam", "SENIOR_UNDERWRITER", 3L, true).addStaff(9, "Zed", "CEO", 3L, true);
        register("E-1", "UNDER_REVIEW");
        Caller una = staff(1, "UNDERWRITER", 1, UW);
        Caller sam = staff(5, "SENIOR_UNDERWRITER", 2, Set.of("case.assign", "queue.pipeline"));
        Caller zed = staff(9, "CEO", 5, UW);

        assertThat(assignment.claim(una, "E-1")).containsEntry("assigneeUserId", 1L);
        assertThat(assignment.claim(una, "E-1")).containsEntry("assigneeUserId", 1L); // idempotent for the owner
        assertThatThrownBy(() -> assignment.claim(sam, "E-1")).isInstanceOf(WorkflowException.class).hasMessageContaining("already assigned to Staff 1").extracting(e -> ((WorkflowException) e).status()).isEqualTo(409);
        assertThatThrownBy(() -> assignment.claim(zed, "E-1")).isInstanceOf(WorkflowException.class).extracting(e -> ((WorkflowException) e).status()).isEqualTo(403); // CEO does not own the review stage

        assertThatThrownBy(() -> assignment.assign(una, "E-1", 5)).hasMessage("Forbidden."); // needs case.assign
        assertThatThrownBy(() -> assignment.assign(sam, "E-1", 9)).isInstanceOf(WorkflowException.class).extracting(e -> ((WorkflowException) e).status()).isEqualTo(400);
        assertThatThrownBy(() -> assignment.assign(sam, "E-1", "x")).hasMessage("userId is required.");
        assertThat(assignment.assign(sam, "E-1", 5)).containsEntry("assigneeUserId", 5L).containsEntry("assigneeName", "Sam");
        assertThat(dir.audits).anyMatch(a -> a.startsWith("CASE_REASSIGNED|E-1|Staff 1 -> Sam"));

        assertThatThrownBy(() -> assignment.release(una, "E-1")).hasMessage("Forbidden."); // not the owner, no case.assign
        assertThat(assignment.release(sam, "E-1")).containsEntry("assigneeUserId", null);
        assertThat(assignment.release(sam, "E-1")).containsEntry("assigneeUserId", null); // nothing to release is fine
        assertThat(dir.audits).anyMatch(a -> a.startsWith("CASE_RELEASED|E-1"));
    }

    @Test
    void aClosedCaseCannotBeAssignedAndACustomerCannotUseOwnership() {
        dir.addStaff(1, "Una", "UNDERWRITER", 3L, true);
        register("E-2", "DECLINED");
        assertThatThrownBy(() -> assignment.claim(underwriter(), "E-2")).hasMessage("This case is closed, so it cannot be assigned.");
        assertThatThrownBy(() -> assignment.claim(customer(7), "E-2")).hasMessage("Forbidden.");
    }

    @Test
    void eligibleStaffAreFilteredByRoleUnitRuleAndShowLoadAndAvailability() {
        publishWith(def -> Js.map(Js.list(def.get("stages")).get(1)).put("owner", Js.obj("roles", List.of("UNDERWRITER"), "unitRule", "CASE_UNIT_OR_ANCESTOR")));
        dir.addStaff(1, "Here", "UNDERWRITER", 3L, true)          // the case's own branch
                .addStaff(2, "Region", "UNDERWRITER", 2L, true)    // an ancestor
                .addStaff(3, "Other", "UNDERWRITER", 4L, true)     // a different branch: excluded
                .addStaff(4, "Senior", "SENIOR_UNDERWRITER", 3L, true); // role not owning the stage: excluded
        register("E-3", "UNDER_REVIEW");
        Caller sam = staff(5, "SENIOR_UNDERWRITER", 2, Set.of("case.assign"));
        assertThat(assignment.eligible(sam, "E-3")).extracting(m -> m.get("userId")).containsExactly(1L, 2L);
        assertThatThrownBy(() -> assignment.eligible(underwriter(), "E-3")).hasMessage("Forbidden.");
    }

    @Test
    void availabilityIsPerPersonAndOverridesTheDirectory() {
        Caller una = staff(1, "UNDERWRITER", 1, UW);
        assertThat(assignment.availability(una)).isTrue();
        assertThat(assignment.setAvailability(una, false)).isFalse();
        assertThat(assignment.availability(una)).isFalse();
        assertThatThrownBy(() -> assignment.setAvailability(una, "yes")).hasMessage("available must be true or false.");
        assertThatThrownBy(() -> assignment.availability(customer(7))).hasMessage("Forbidden.");
        assertThat(dir.audits).anyMatch(a -> a.startsWith("STAFF_UNAVAILABLE|1"));
    }

    // ---------------------------------------------------------------- scope and SLA

    @Test
    void staffOutsideTheirScopeSeeNeitherTheCaseNorItsActions() {
        register("F-1", "UNDER_REVIEW");
        Caller otherBranch = new Caller(new Actor("STAFF", 20, "Other", "UNDERWRITER", 1, UW, "UNIT_ONLY"), 4L);
        Caller region = new Caller(new Actor("STAFF", 21, "Region", "UNDERWRITER", 1, UW, "UNIT_TREE"), 2L);
        Caller sameBranch = new Caller(new Actor("STAFF", 22, "Same", "UNDERWRITER", 1, UW, "UNIT_ONLY"), 3L);
        assertThatThrownBy(() -> transitions.describeActions(otherBranch, "F-1")).hasMessage("Application not found.");
        assertThat(run("F-1", otherBranch, "decline", Js.obj("reason", "x"))).containsEntry("status", 404).containsEntry("code", "CASE_NOT_FOUND");
        assertThat(Js.list(transitions.describeActions(region, "F-1").get("allowed"))).isNotEmpty();
        assertThat(Js.list(transitions.describeActions(sameBranch, "F-1").get("allowed"))).isNotEmpty();
        assertThat(statusOf("F-1")).isEqualTo("UNDER_REVIEW");
    }

    @Test
    void aCustomerOnlyAsksAboutTheirOwnCase() {
        register("F-2", "SUBMITTED");
        assertThat(Js.list(transitions.describeActions(customer(7), "F-2").get("allowed"))).extracting(a -> Js.map(a).get("key")).contains("withdraw", "cancel");
        assertThatThrownBy(() -> transitions.describeActions(customer(8), "F-2")).hasMessage("Application not found.");
    }

    @Test
    void actionsComeInTheDefinitionsOrderWithPresentationAndBlockedReasons() {
        register("F-3", "UNDER_REVIEW");
        Map<String, Object> v = transitions.describeActions(underwriter(), "F-3");
        List<Object> keys = Js.list(v.get("allowed")).stream().map(a -> Js.map(a).get("key")).toList();
        assertThat(keys).containsSubsequence("approve_conditional", "approve", "decline", "send_back", "refer", "add_note");
        Map<String, Object> approve = Js.list(v.get("allowed")).stream().map(Js::map).filter(a -> a.get("key").equals("approve")).findFirst().orElseThrow();
        assertThat(approve.get("event")).isEqualTo("case.approved");
        assertThat(Js.map(approve.get("ui"))).containsEntry("area", "decision").containsEntry("style", "primary");
        assertThat(Js.map(Js.map(v.get("blocked")).get("authorise"))).containsEntry("code", "INVALID_STATE");
    }

    @Test
    void theSlaClockGoesAmberThenRedAndRollsUpTheOrgTree() {
        String old = Instant.now().minus(60, ChronoUnit.HOURS).toString();       // review stage allows 48h -> red
        String warm = Instant.now().minus(40, ChronoUnit.HOURS).toString();      // 83% -> amber
        String fresh = Instant.now().minus(1, ChronoUnit.HOURS).toString();      // green
        cases.register("G-1", Js.obj("status", "UNDER_REVIEW", "orgUnitId", 3, "enteredAt", old));
        cases.register("G-2", Js.obj("status", "UNDER_REVIEW", "orgUnitId", 3, "enteredAt", warm));
        cases.register("G-3", Js.obj("status", "UNDER_REVIEW", "orgUnitId", 4, "enteredAt", fresh));
        cases.register("G-4", Js.obj("status", "SUBMITTED", "enteredAt", fresh));      // no unit
        cases.register("G-5", Js.obj("status", "DECLINED", "orgUnitId", 3, "enteredAt", old)); // closed: not counted
        assertThat(Js.map(assignment.info("G-1").get("sla"))).containsEntry("state", "RED");
        assertThat(Js.map(assignment.info("G-2").get("sla"))).containsEntry("state", "AMBER");

        Map<String, Object> s = assignment.slaSummary(underwriter());
        Map<String, Map<String, Object>> byUnit = new java.util.LinkedHashMap<>();
        for (Object u : Js.list(s.get("units"))) byUnit.put(String.valueOf(Js.map(u).get("unitId")), Js.map(u));
        assertThat(Js.map(Js.map(byUnit.get("3")).get("total"))).containsEntry("red", 1).containsEntry("amber", 1).containsEntry("total", 2);
        assertThat(Js.map(Js.map(byUnit.get("4")).get("own"))).containsEntry("green", 1);
        assertThat(Js.map(Js.map(byUnit.get("2")).get("own"))).containsEntry("total", 0);               // the region owns nothing itself
        assertThat(Js.map(Js.map(byUnit.get("2")).get("total"))).containsEntry("total", 3).containsEntry("unassigned", 3); // ...but rolls up its branches
        assertThat(Js.map(Js.map(byUnit.get("1")).get("total"))).containsEntry("total", 3);
        assertThat(Js.map(s.get("noUnit"))).containsEntry("total", 1).containsEntry("green", 1);

        // a branch-scoped caller sees only their branch's cases
        Caller branchB = new Caller(new Actor("STAFF", 30, "B", "UNDERWRITER", 1, UW, "UNIT_ONLY"), 4L);
        assertThat(Js.map(Js.map(Js.map(assignment.slaSummary(branchB).get("units") instanceof List<?> l ? l.get(0) : null).get("total"))).get("total")).isEqualTo(1);
    }

    @Test
    void anUnreachableOrgServiceFailsClosedForScopedStaffInsteadOfGuessing() {
        register("H-1", "UNDER_REVIEW");
        dir.orgDown = true;
        Caller region = new Caller(new Actor("STAFF", 21, "Region", "UNDERWRITER", 1, UW, "UNIT_TREE"), 2L);
        assertThatThrownBy(() -> transitions.describeActions(region, "H-1")).isInstanceOf(com.digibank.workflow.client.Directory.UpstreamUnavailableException.class);
        // unrestricted staff never need the org tree
        assertThat(Js.list(transitions.describeActions(underwriter(), "H-1").get("allowed"))).isNotEmpty();
    }

    @Test
    void theProjectionCarriesEveryVersionsStatusLabelsAndTheActionTable() {
        Map<String, Object> p = definitions.projectPublished();
        assertThat(p).containsKeys("definitionId", "key", "version", "stages", "statuses", "queues", "actions");
        assertThat(Js.map(Js.map(p.get("statuses")).get("case"))).containsKeys("DRAFT", "APPROVED", "WITHDRAWN");
        assertThat(Js.map(Js.map(p.get("actions")).get("approve"))).containsEntry("track", "case").containsEntry("to", "APPROVED");
        assertThat(definitions.statusesByCategory(List.of("ACTIVE"))).contains("SUBMITTED", "APPROVED").doesNotContain("DRAFT", "DECLINED");
    }
}
