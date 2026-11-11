package com.digibank.application.security;

import com.digibank.application.audittrail.AuditTrailService;
import com.digibank.application.audittrail.NotesController;
import com.digibank.application.businessfinancials.BusinessFinancialsAnalysisService;
import com.digibank.application.businessfinancials.BusinessFinancialsController;
import com.digibank.application.client.RoleLadderClient;
import com.digibank.application.client.RuleServiceClient;
import com.digibank.application.client.WorkflowClient;
import com.digibank.application.dataverification.DataVerificationController;
import com.digibank.application.dataverification.DataVerificationService;
import com.digibank.application.decisioning.DecisioningController;
import com.digibank.application.decisioning.DecisioningService;
import com.digibank.application.decisioning.StaffQueueController;
import com.digibank.application.org.OrgScope;
import com.digibank.application.repository.CaseReferralRepository;
import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.repository.UnderwritingNoteRepository;
import com.digibank.application.wizard.WizardController;
import com.digibank.application.wizard.WizardService;
import com.digibank.application.workflow.QueueService;
import com.digibank.application.workflow.WorkflowActionController;
import com.digibank.application.workflow.WorkflowActions;
import com.digibank.application.workflow.WorkflowAdminController;
import com.digibank.application.workflow.WorkflowCases;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * The real security configuration and the real token filter, driven with real signed tokens: each staff
 * endpoint is open only to a token that holds the entitlement the Worker requires for it, whatever the
 * person's role is called. Controllers are mocked away; only the access decision is under test.
 */
@WebMvcTest(controllers = {DecisioningController.class, WizardController.class, NotesController.class, StaffQueueController.class,
        DataVerificationController.class, BusinessFinancialsController.class, WorkflowActionController.class, WorkflowAdminController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class, JsonAccessDeniedHandler.class})
@TestPropertySource(properties = {
        "app.jwt.secret=test-secret-test-secret-test-secret-0123456789",
        "app.auth-service.url=http://localhost:1",
        "eureka.client.enabled=false", "spring.cloud.discovery.enabled=false"
})
class EndpointPermissionsTest {

    static final String SECRET = "test-secret-test-secret-test-secret-0123456789";

    @Autowired MockMvc mvc;
    @MockitoBean SessionRevocationCache revocation;
    @MockitoBean DecisioningService decisioningService;
    @MockitoBean RuleServiceClient ruleServiceClient;
    @MockitoBean RoleLadderClient roleLadderClient;
    @MockitoBean WorkflowClient workflowClient;
    @MockitoBean WorkflowActions workflowActions;
    @MockitoBean WorkflowCases workflowCases;
    @MockitoBean QueueService queueService;
    @MockitoBean WizardService wizardService;
    @MockitoBean AuditTrailService auditTrailService;
    @MockitoBean DataVerificationService dataVerificationService;
    @MockitoBean BusinessFinancialsAnalysisService businessFinancialsAnalysisService;
    @MockitoBean LoanApplicationRepository applicationRepository;
    @MockitoBean UnderwritingNoteRepository noteRepository;
    @MockitoBean CaseReferralRepository referralRepository;
    @MockitoBean OrgScope orgScope;
    @MockitoBean CaseAccess caseAccess;

    /** method, path, the entitlement that opens it */
    record Rule(HttpMethod method, String path, String entitlement) {}

    static final List<Rule> RULES = List.of(
            new Rule(HttpMethod.GET, "/api/applications/pipeline", "queue.pipeline"),
            new Rule(HttpMethod.GET, "/api/applications/banker-queue", "queue.banker"),
            new Rule(HttpMethod.GET, "/api/applications/APP-1/mandate", "mandates.view"),
            new Rule(HttpMethod.GET, "/api/applications/home-stats", "dashboard.view"),
            new Rule(HttpMethod.GET, "/api/applications/staff-activity", "dashboard.view"),
            new Rule(HttpMethod.PUT, "/api/applications/APP-1/section-by-underwriter", "case.editSection"),
            new Rule(HttpMethod.POST, "/api/applications/APP-1/notes", "case.addNote"),
            new Rule(HttpMethod.POST, "/api/applications/APP-1/decline", "case.decline"),
            new Rule(HttpMethod.POST, "/api/applications/APP-1/send-back", "case.sendBack"),
            new Rule(HttpMethod.POST, "/api/applications/APP-1/approve", "case.approve"),
            new Rule(HttpMethod.POST, "/api/applications/APP-1/approve-by-underwriter", "case.approve"),
            new Rule(HttpMethod.POST, "/api/applications/APP-1/refer-to-senior", "case.refer"),
            new Rule(HttpMethod.POST, "/api/applications/APP-1/disbursement/authorise", "case.disburse"),
            new Rule(HttpMethod.POST, "/api/applications/APP-1/disbursement/second-check", "case.disburseSecondCheck"),
            new Rule(HttpMethod.POST, "/api/applications/APP-1/data-verification/resolve", "case.resolveVerification"));

    static final List<String> EVERY_ENTITLEMENT = List.of(
            "portal.underwriter", "portal.banker", "queue.pipeline", "queue.banker", "dashboard.view", "case.addNote",
            "case.editSection", "case.approve", "case.decline", "case.sendBack", "case.refer", "case.disburse",
            "case.disburseSecondCheck", "case.branchReview", "case.assign", "case.resolveVerification", "case.actAsCustomer", "mandates.view");

    private static String token(String role, String roleLabel, Collection<String> entitlements) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", role);
        claims.put("userId", 99L);
        claims.put("fullName", "Test " + role);
        if (roleLabel != null) claims.put("roleLabel", roleLabel);
        if (entitlements != null) claims.put("entitlements", new ArrayList<>(entitlements));
        Date now = new Date();
        return Jwts.builder().setClaims(claims).setSubject("uuid-99").setIssuedAt(now)
                .setExpiration(new Date(now.getTime() + 3_600_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes()), SignatureAlgorithm.HS256).compact();
    }

    private int call(Rule r, String bearer) {
        MockHttpServletRequestBuilder b = request(r.method(), r.path()).contentType(MediaType.APPLICATION_JSON).content("{}");
        if (bearer != null) b.header("Authorization", "Bearer " + bearer);
        try {
            return mvc.perform(b).andReturn().getResponse().getStatus();
        } catch (Exception e) {
            return 500; // the controller ran (and the mocked service gave it nothing): access was granted
        }
    }

    private static boolean granted(int status) {
        return status != 401 && status != 403;
    }

    @Test
    void everyStaffEndpointRejectsAnUnauthenticatedCaller() {
        for (Rule r : RULES) assertThat(call(r, null)).as(r.method() + " " + r.path()).isEqualTo(401);
    }

    @Test
    void everyStaffEndpointRejectsACustomer() {
        String customer = token("CUSTOMER", null, null);
        for (Rule r : RULES) assertThat(call(r, customer)).as(r.method() + " " + r.path()).isEqualTo(403);
    }

    @Test
    void everyStaffEndpointNeedsExactlyItsEntitlement() {
        for (Rule r : RULES) {
            List<String> allButThis = EVERY_ENTITLEMENT.stream().filter(e -> !e.equals(r.entitlement())).toList();
            assertThat(call(r, token("UNDERWRITER", "Underwriter", allButThis)))
                    .as("%s %s without %s".formatted(r.method(), r.path(), r.entitlement())).isEqualTo(403);
            assertThat(granted(call(r, token("UNDERWRITER", "Underwriter", List.of(r.entitlement())))))
                    .as("%s %s with only %s".formatted(r.method(), r.path(), r.entitlement())).isTrue();
        }
    }

    @Test
    void aRoleAnAdminCreatedWorksSoLongAsItHoldsTheEntitlement() {
        // BRANCH_OFFICER appears in no hard-coded list anywhere: access follows the entitlement alone.
        for (Rule r : RULES) {
            assertThat(granted(call(r, token("BRANCH_OFFICER", "Branch Officer", List.of(r.entitlement())))))
                    .as("%s %s".formatted(r.method(), r.path())).isTrue();
        }
    }

    @Test
    void aTokenIssuedBeforeEntitlementsTravelledInItHoldsNothing() {
        // role alone, as the old tokens were: fail closed until the person signs in again
        String old = token("UNDERWRITER", null, null);
        for (Rule r : RULES) assertThat(call(r, old)).as(r.method() + " " + r.path()).isEqualTo(403);
    }

    @Test
    void theWorkflowBackfillIsForTheAdminRoleOnly() {
        Rule backfill = new Rule(HttpMethod.POST, "/api/applications/admin/workflow-backfill", null);
        assertThat(call(backfill, null)).isEqualTo(401);
        assertThat(call(backfill, token("CUSTOMER", null, null))).isEqualTo(403);
        assertThat(call(backfill, token("UNDERWRITER", "Underwriter", EVERY_ENTITLEMENT))).isEqualTo(403);
        assertThat(granted(call(backfill, token("ADMIN", "Admin", EVERY_ENTITLEMENT)))).isTrue();
    }

    @Test
    void theGenericActionRouteNeedsASignedInCallerAndLeavesTheActionsEntitlementToTheEngine() {
        Rule run = new Rule(HttpMethod.POST, "/api/workflow/cases/APP-1/actions/decline", null);
        assertThat(call(run, null)).isEqualTo(401);
        // authenticated callers get past the chain (the case-visibility and entitlement checks follow in the controller and engine)
        assertThat(granted(call(run, token("CUSTOMER", null, null)))).isTrue();
        assertThat(granted(call(run, token("UNDERWRITER", "Underwriter", List.of())))).isTrue();
    }

    @Test
    void routesWithNoEntitlementRuleStillNeedASignedInCaller() {
        Rule read = new Rule(HttpMethod.GET, "/api/applications/APP-1/notes", null);
        assertThat(call(read, null)).isEqualTo(401);
        assertThat(granted(call(read, token("CUSTOMER", null, null)))).isTrue();
    }
}
