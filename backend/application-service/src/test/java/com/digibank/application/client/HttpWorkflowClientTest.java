package com.digibank.application.client;

import com.digibank.application.config.ApiException;
import com.digibank.application.workflow.EvaluateRequest;
import com.digibank.application.workflow.Evaluation;
import com.digibank.application.workflow.QueueSettings;
import com.digibank.application.workflow.WorkflowActor;
import com.digibank.application.workflow.WorkflowUnavailableException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** The wire contract with workflow-service (backend/workflow-service/README.md) and the 503 failure mode. */
class HttpWorkflowClientTest {

    static final String BASE = "http://workflow:8089";
    static final WorkflowActor STAFF = new WorkflowActor("STAFF", 5, "Una", "UNDERWRITER", 1, Set.of("case.decline", "case.approve"), "ALL", 3L);

    MockRestServiceServer server;
    HttpWorkflowClient client;

    @BeforeEach
    void setUp() {
        RestTemplate rest = new RestTemplate();
        server = MockRestServiceServer.createServer(rest);
        client = new HttpWorkflowClient(rest, new ObjectMapper(), BASE);
    }

    private static EvaluateRequest request(boolean commit) {
        return new EvaluateRequest("decline", STAFF, Map.of("reason", "r"), Map.of("referredToRole", "COO"), commit, "key-1");
    }

    private static final String SUCCESS = """
            {"ok":true,"action":"decline","event":"case.declined","track":"case","from":{"status":"UNDER_REVIEW","stage":"s1"},
             "to":{"status":"DECLINED","stage":"s9"},"tracks":{},"fieldUpdates":{"referredToRole":null},
             "referral":{"close":true,"open":null},
             "hostEffects":[{"type":"NOTE","noteType":"DECISION_DECLINED","section":"general","text":"r"},{"type":"EMAIL","event":"DECISION_DECLINED","vars":{"declineReason":"r"}}],
             "log":{"reason":"r","actorName":"Una"},"mirror":{"status":"DECLINED"},
             "audit":{"write":true,"eventType":"case.declined","actor":"Una","actorRole":"UNDERWRITER","detail":"decline: UNDER_REVIEW -> DECLINED (r)"},
             "routed":null,"committed":false,"replayed":false}""";

    // ---- evaluate ----------------------------------------------------------------------------------

    @Test
    void evaluateSendsTheContractBodyAndReadsASuccess() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1/evaluate")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.action").value("decline"))
                .andExpect(jsonPath("$.commit").value(false))
                .andExpect(jsonPath("$.idempotencyKey").value("key-1"))
                .andExpect(jsonPath("$.input.reason").value("r"))
                .andExpect(jsonPath("$.fields.referredToRole").value("COO"))
                .andExpect(jsonPath("$.actor.type").value("STAFF"))
                .andExpect(jsonPath("$.actor.userId").value(5))
                .andExpect(jsonPath("$.actor.role").value("UNDERWRITER"))
                .andExpect(jsonPath("$.actor.rank").value(1))
                .andExpect(jsonPath("$.actor.scope").value("ALL"))
                .andExpect(jsonPath("$.actor.orgUnitId").value(3))
                .andExpect(jsonPath("$.actor.entitlements[0]").value("case.approve"))
                .andRespond(withSuccess(SUCCESS, MediaType.APPLICATION_JSON));

        Evaluation e = client.evaluate("APP-1", request(false));

        assertThat(e.ok()).isTrue();
        assertThat(e.event()).isEqualTo("case.declined");
        assertThat(e.to()).containsEntry("status", "DECLINED");
        assertThat(e.mirror()).containsEntry("status", "DECLINED");
        assertThat(e.fieldUpdates()).containsKey("referredToRole");
        assertThat(e.referralClose()).isTrue();
        assertThat(e.referralOpenToRole()).isNull();
        assertThat(e.hostEffects()).extracting(h -> h.get("type")).containsExactly("NOTE", "EMAIL");
        assertThat(e.audit()).containsEntry("write", true).containsEntry("eventType", "case.declined");
        assertThat(e.log()).containsEntry("reason", "r");
        server.verify();
    }

    @Test
    void anEngineRefusalIsAnAnswerNotAnException() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1/evaluate"))
                .andRespond(withSuccess("{\"ok\":false,\"status\":403,\"code\":\"OVER_MANDATE\",\"message\":\"Amount (9) exceeds your mandate limit (1) for this case.\"}", MediaType.APPLICATION_JSON));
        Evaluation e = client.evaluate("APP-1", request(true));
        assertThat(e.ok()).isFalse();
        assertThat(e.status()).isEqualTo(403);
        assertThat(e.code()).isEqualTo("OVER_MANDATE");
        assertThat(e.message()).startsWith("Amount (9) exceeds");
    }

    @Test
    void aReferralCarriesItsTargetRole() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1/evaluate"))
                .andRespond(withSuccess(SUCCESS.replace("\"open\":null", "\"open\":{\"toRole\":\"COO\"}"), MediaType.APPLICATION_JSON));
        assertThat(client.evaluate("APP-1", request(true)).referralOpenToRole()).isEqualTo("COO");
    }

    @Test
    void aReplayedAnswerIsFlagged() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1/evaluate"))
                .andRespond(withSuccess(SUCCESS.replace("\"replayed\":false", "\"replayed\":true").replace("\"committed\":false", "\"committed\":true"), MediaType.APPLICATION_JSON));
        Evaluation e = client.evaluate("APP-1", request(true));
        assertThat(e.replayed()).isTrue();
        assertThat(e.committed()).isTrue();
    }

    // ---- failure modes -----------------------------------------------------------------------------

    @Test
    void aServerErrorIsA503ForTheUser() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1/evaluate"))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"success\":false,\"message\":\"A service this action depends on is unavailable. Try again shortly.\",\"data\":null}"));
        assertThatThrownBy(() -> client.evaluate("APP-1", request(false))).isInstanceOfSatisfying(WorkflowUnavailableException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(503);
            assertThat(e.getMessage()).isEqualTo("A service this action depends on is unavailable. Try again shortly.");
        });
    }

    @Test
    void anInternalServerErrorIsA503Too() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1/evaluate")).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
        assertThatThrownBy(() -> client.evaluate("APP-1", request(false))).isInstanceOf(WorkflowUnavailableException.class);
    }

    @Test
    void aConnectionFailureOrTimeoutIsA503() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1/evaluate")).andRespond(r -> { throw new IOException("connection refused"); });
        assertThatThrownBy(() -> client.evaluate("APP-1", request(false))).isInstanceOf(WorkflowUnavailableException.class);
    }

    @Test
    void anEmptyAnswerIsA503() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1/evaluate")).andRespond(withStatus(HttpStatus.OK));
        assertThatThrownBy(() -> client.evaluate("APP-1", request(false))).isInstanceOf(WorkflowUnavailableException.class);
    }

    @Test
    void aMalformedRequestKeepsWorkflowServicesOwnStatusAndMessage() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1/evaluate"))
                .andRespond(withStatus(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"success\":false,\"message\":\"Idempotency key already used for another case.\",\"data\":null}"));
        assertThatThrownBy(() -> client.evaluate("APP-1", request(true))).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e).isNotInstanceOf(WorkflowUnavailableException.class);
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getMessage()).isEqualTo("Idempotency key already used for another case.");
        });
    }

    @Test
    void aFourHundredWithNoJsonBodyStillGivesAMessage() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1/evaluate")).andRespond(withStatus(HttpStatus.BAD_REQUEST).body("nope"));
        assertThatThrownBy(() -> client.evaluate("APP-1", request(true))).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(400);
            assertThat(e.getMessage()).isNotBlank();
        });
    }

    // ---- register, backfill, info, queues ----------------------------------------------------------

    @Test
    void registerPutsTheSummaryAtTheCasePath() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1")).andExpect(method(HttpMethod.PUT))
                .andExpect(jsonPath("$.customerId").value(7)).andExpect(jsonPath("$.status").value("DRAFT"))
                .andRespond(withSuccess("{\"applicationRef\":\"APP-1\",\"created\":true}", MediaType.APPLICATION_JSON));
        assertThat(client.register("APP-1", Map.of("customerId", 7, "status", "DRAFT"))).containsEntry("created", true);
        server.verify();
    }

    @Test
    void registerFailsWith503WhenWorkflowServiceIsDown() {
        server.expect(requestTo(BASE + "/internal/workflow/cases/APP-1")).andRespond(r -> { throw new IOException("down"); });
        assertThatThrownBy(() -> client.register("APP-1", Map.of())).isInstanceOf(WorkflowUnavailableException.class);
    }

    @Test
    void backfillPostsTheCasesAndReturnsTheCounts() {
        server.expect(requestTo(BASE + "/internal/workflow/backfill")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.cases[0].applicationRef").value("A-1")).andExpect(jsonPath("$.cases.length()").value(2))
                .andRespond(withSuccess("{\"created\":1,\"updated\":1,\"failed\":[]}", MediaType.APPLICATION_JSON));
        Map<String, Object> r = client.backfill(List.of(Map.of("applicationRef", "A-1"), Map.of("applicationRef", "A-2")));
        assertThat(r).containsEntry("created", 1).containsEntry("updated", 1);
    }

    @Test
    void infoAsksForTheRefsAndReadsTheMapAndSkipsTheCallForNone() {
        assertThat(client.info(List.of())).isEmpty();
        server.expect(requestTo(BASE + "/internal/workflow/info")).andExpect(jsonPath("$.refs[1]").value("A-2"))
                .andRespond(withSuccess("{\"A-1\":{\"track\":\"case\",\"status\":\"SUBMITTED\",\"assigneeUserId\":5}}", MediaType.APPLICATION_JSON));
        Map<String, Map<String, Object>> info = client.info(List.of("A-1", "A-2"));
        assertThat(info).containsOnlyKeys("A-1");
        assertThat(info.get("A-1")).containsEntry("status", "SUBMITTED");
        server.verify();
    }

    @Test
    void resolveQueueSendsKeysAndActorAndReadsTheSettings() {
        server.expect(requestTo(BASE + "/internal/workflow/queues/resolve")).andExpect(jsonPath("$.keys[0]").value("home-stats-staff"))
                .andExpect(jsonPath("$.actor.entitlements[0]").value("case.approve"))
                .andRespond(withSuccess("{\"ok\":true,\"queue\":\"home-stats-banker\",\"statuses\":[\"DRAFT\",\"APPROVED\"],\"applyScope\":true,\"hideReferredAbove\":false}", MediaType.APPLICATION_JSON));
        QueueSettings q = client.resolveQueue(List.of("home-stats-staff", "home-stats-banker"), STAFF);
        assertThat(q).isEqualTo(new QueueSettings("home-stats-banker", List.of("DRAFT", "APPROVED"), true, false));
    }

    @Test
    void aQueueTheActorMayNotOpenIsA403() {
        server.expect(requestTo(BASE + "/internal/workflow/queues/resolve"))
                .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON).body("{\"success\":false,\"message\":\"Forbidden.\",\"data\":null}"));
        assertThatThrownBy(() -> client.resolveQueue(List.of("pipeline"), STAFF)).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(403);
            assertThat(e.getMessage()).isEqualTo("Forbidden.");
        });
    }

    // ---- the next actions, with the caller's own token ---------------------------------------------

    @Test
    void actionsAreAskedWithTheCallersTokenAndAFailureGivesNull() {
        server.expect(requestTo(BASE + "/api/workflow/cases/APP-1/actions")).andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer abc"))
                .andRespond(withSuccess("{\"allowed\":[],\"blocked\":{}}", MediaType.APPLICATION_JSON));
        assertThat(client.actionsFor("APP-1", "Bearer abc")).containsKey("allowed");
        server.verify();
    }

    @Test
    void aFailureListingTheNextActionsGivesNullAndNoTokenMeansNoCall() {
        server.expect(requestTo(BASE + "/api/workflow/cases/APP-1/actions")).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
        assertThat(client.actionsFor("APP-1", "Bearer abc")).isNull();
        assertThat(client.actionsFor("APP-1", null)).isNull();
        server.verify();
    }
}
