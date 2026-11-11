package com.digibank.application.security;

import com.digibank.application.audittrail.AuditTrailService;
import com.digibank.application.audittrail.NotesController;
import com.digibank.application.businessfinancials.BusinessFinancialsAnalysisService;
import com.digibank.application.businessfinancials.BusinessFinancialsController;
import com.digibank.application.client.AuthServiceOrgClient;
import com.digibank.application.client.RoleLadderClient;
import com.digibank.application.client.RuleServiceClient;
import com.digibank.application.client.WorkflowClient;
import com.digibank.application.config.ApiException;
import com.digibank.application.dataverification.DataVerificationController;
import com.digibank.application.dataverification.DataVerificationService;
import com.digibank.application.decisioning.DecisioningController;
import com.digibank.application.decisioning.DecisioningService;
import com.digibank.application.decisioning.StaffQueueController;
import com.digibank.application.model.LoanApplication;
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
import com.digibank.application.workflow.WorkflowUnavailableException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The generic action route, the legacy decision routes, the Decision tab's mandate and the backfill, through the real
 * security chain and real signed tokens; the services behind them (and workflow-service) are mocked.
 */
@WebMvcTest(controllers = {WizardController.class, DecisioningController.class, NotesController.class, DataVerificationController.class,
        BusinessFinancialsController.class, StaffQueueController.class, WorkflowActionController.class, WorkflowAdminController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class, JsonAccessDeniedHandler.class,
        CaseAccess.class, OrgScope.class, QueueService.class})
@TestPropertySource(properties = {
        "app.jwt.secret=" + TestTokens.SECRET,
        "app.auth-service.url=http://localhost:1",
        "eureka.client.enabled=false", "spring.cloud.discovery.enabled=false"
})
class WorkflowRoutesTest {

    static final long OWNER = 7L;

    @Autowired MockMvc mvc;
    @MockitoBean SessionRevocationCache revocation;
    @MockitoBean LoanApplicationRepository repository;
    @MockitoBean AuthServiceOrgClient orgClient;
    @MockitoBean WizardService wizardService;
    @MockitoBean DecisioningService decisioningService;
    @MockitoBean RuleServiceClient ruleServiceClient;
    @MockitoBean RoleLadderClient roleLadderClient;
    @MockitoBean WorkflowClient workflowClient;
    @MockitoBean WorkflowActions workflowActions;
    @MockitoBean WorkflowCases workflowCases;
    @MockitoBean AuditTrailService auditTrailService;
    @MockitoBean DataVerificationService dataVerificationService;
    @MockitoBean BusinessFinancialsAnalysisService businessFinancialsAnalysisService;
    @MockitoBean UnderwritingNoteRepository noteRepository;
    @MockitoBean CaseReferralRepository referralRepository;

    private static LoanApplication app(Long orgUnitId) {
        return LoanApplication.builder().applicationRef("APP-1").customerId(OWNER).customerEmail("o@x.test").status("IN_PROGRESS")
                .applicationType("PERSONAL").orgUnitId(orgUnitId).build();
    }

    @BeforeEach
    void caseExists() {
        when(repository.findByApplicationRef("APP-1")).thenReturn(Optional.of(app(10L)));
        when(repository.findByApplicationRef("MISSING")).thenReturn(Optional.empty());
        when(orgClient.units()).thenReturn(List.of());
    }

    private ResultActions post(String path, String body, String token, String... headers) throws Exception {
        var b = request(HttpMethod.POST, path).contentType(MediaType.APPLICATION_JSON).content(body).header("Authorization", "Bearer " + token);
        for (int i = 0; i < headers.length; i += 2) b.header(headers[i], headers[i + 1]);
        return mvc.perform(b);
    }

    private ResultActions get(String path, String token) throws Exception {
        return mvc.perform(request(HttpMethod.GET, path).header("Authorization", "Bearer " + token));
    }

    private WorkflowActions.Run runOf() {
        ArgumentCaptor<WorkflowActions.Run> run = ArgumentCaptor.forClass(WorkflowActions.Run.class);
        verify(workflowActions).run(eq("APP-1"), run.capture());
        return run.getValue();
    }

    // ---- the generic route -----------------------------------------------------------------------------

    @Test
    void theGenericActionRunsForTheOwnerPassesTheInputAndTheKeyAndAnswersApplicationAndActions() throws Exception {
        String token = TestTokens.customer(OWNER);
        LoanApplication after = app(10L);
        after.setStatus("SUBMITTED");
        when(workflowActions.run(eq("APP-1"), any())).thenReturn(new WorkflowActions.Result(after, null));
        when(workflowClient.actionsFor("APP-1", "Bearer " + token)).thenReturn(Map.of("allowed", List.of(), "blocked", Map.of()));

        post("/api/workflow/cases/APP-1/actions/submit", "{\"input\":{\"a\":1}}", token, "Idempotency-Key", "k-123")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.application.applicationRef").value("APP-1"))
                .andExpect(jsonPath("$.application.status").value("SUBMITTED"))
                .andExpect(jsonPath("$.actions.allowed").isArray());

        WorkflowActions.Run run = runOf();
        assertThat(run.action()).isEqualTo("submit");
        assertThat(run.input()).isEqualTo(Map.of("a", 1));
        assertThat(run.idempotencyKey()).isEqualTo("k-123");
        assertThat(run.actor().type()).isEqualTo("CUSTOMER");
        assertThat(run.actor().userId()).isEqualTo(OWNER);
    }

    @Test
    void staffInScopeRunAnActionAsStaffWithTheirEntitlementsAndScope() throws Exception {
        when(workflowActions.run(eq("APP-1"), any())).thenReturn(new WorkflowActions.Result(app(10L), null));
        post("/api/workflow/cases/APP-1/actions/decline", "{\"input\":{\"reason\":\"r\"}}", TestTokens.staff(50, "UNDERWRITER", "UNIT_TREE", 10L, "case.decline"))
                .andExpect(status().isOk());
        WorkflowActions.Run run = runOf();
        assertThat(run.actor().type()).isEqualTo("STAFF");
        assertThat(run.actor().entitlements()).containsExactly("case.decline");
        assertThat(run.actor().scope()).isEqualTo("UNIT_TREE");
        assertThat(run.actor().orgUnitId()).isEqualTo(10L);
        assertThat(run.input()).containsEntry("reason", "r");
        assertThat(run.idempotencyKey()).isNull();
    }

    @Test
    void theNextActionsCanBeMissingAndTheActionStillSucceeds() throws Exception {
        when(workflowActions.run(eq("APP-1"), any())).thenReturn(new WorkflowActions.Result(app(10L), null));
        when(workflowClient.actionsFor(any(), any())).thenReturn(null);
        post("/api/workflow/cases/APP-1/actions/withdraw", "{}", TestTokens.customer(OWNER))
                .andExpect(status().isOk()).andExpect(jsonPath("$.actions").value(nullValue()))
                .andExpect(jsonPath("$.application.applicationRef").value("APP-1"));
    }

    @Test
    void aBodyThatIsNotJsonOrHasNoInputIsAnEmptyInput() throws Exception {
        when(workflowActions.run(eq("APP-1"), any())).thenReturn(new WorkflowActions.Result(app(10L), null));
        String owner = TestTokens.customer(OWNER);
        for (String body : new String[]{"not json", "", "[1,2]", "{\"input\":[1]}", "{\"input\":\"x\"}"}) {
            clearInvocations(workflowActions);
            post("/api/workflow/cases/APP-1/actions/cancel", body, owner).andExpect(status().isOk());
            assertThat(runOf().input()).as(body).isEmpty();
        }
    }

    @Test
    void anEngineRefusalAnd503ReachTheCallerInTheWorkersErrorShape() throws Exception {
        String staff = TestTokens.staff(50, "UNDERWRITER", "ALL", null, "case.decline");
        when(workflowActions.run(eq("APP-1"), any())).thenThrow(new ApiException(403, "This case has been referred to COO and can only be actioned at that level or above."));
        post("/api/workflow/cases/APP-1/actions/decline", "{\"input\":{\"reason\":\"r\"}}", staff)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("This case has been referred to COO and can only be actioned at that level or above."));

        when(workflowActions.run(eq("APP-1"), any())).thenThrow(new WorkflowUnavailableException(null));
        post("/api/workflow/cases/APP-1/actions/decline", "{}", staff)
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("A service this action depends on is unavailable. Try again shortly."));
    }

    // ---- the legacy routes hand the engine the caller and the inputs ----------------------------------

    @Test
    void theLegacyDecisionRoutesPassTheCallerAndTheirInputsToTheService() throws Exception {
        String staff = TestTokens.staff(50, "UNDERWRITER", "ALL", null, "case.decline", "case.approve", "case.sendBack", "case.refer", "case.addNote");
        post("/api/applications/APP-1/decline", "{\"reason\":\"too risky\"}", staff).andExpect(status().isOk());
        verify(decisioningService).declineApplication(eq("APP-1"), any(), eq("too risky"));
        post("/api/applications/APP-1/decline", "{}", staff).andExpect(status().isOk());
        verify(decisioningService).declineApplication(eq("APP-1"), any(), isNull());

        post("/api/applications/APP-1/send-back", "{\"reason\":\"r\",\"requireGuarantor\":\"true\"}", staff).andExpect(status().isOk());
        verify(decisioningService).sendBackApplication(eq("APP-1"), any(), eq("r"), eq(true));
        post("/api/applications/APP-1/send-back", "{\"reason\":\"r\"}", staff).andExpect(status().isOk());
        verify(decisioningService).sendBackApplication(eq("APP-1"), any(), eq("r"), eq(false));

        post("/api/applications/APP-1/approve-by-underwriter", "{\"approvedAmount\":\"1500.50\"}", staff).andExpect(status().isOk());
        verify(decisioningService).approveApplicationByUnderwriter(eq("APP-1"), any(), eq(new BigDecimal("1500.50")));
        post("/api/applications/APP-1/approve-by-underwriter", "{\"approvedAmount\":\"abc\"}", staff).andExpect(status().isOk());
        verify(decisioningService).approveApplicationByUnderwriter(eq("APP-1"), any(), isNull());

        post("/api/applications/APP-1/refer-to-senior", "{\"reason\":\"big\",\"toRole\":\"COO\"}", staff).andExpect(status().isOk());
        verify(decisioningService).referToSeniorUnderwriter(eq("APP-1"), any(), eq("big"), eq("COO"));

        post("/api/applications/APP-1/approve", "{}", staff).andExpect(status().isOk());
        verify(decisioningService).approveApplication(eq("APP-1"), any());

        post("/api/applications/APP-1/notes", "{\"section\":\"income\",\"note\":\"n\"}", staff).andExpect(status().isOk());
        verify(decisioningService).addNote(eq("APP-1"), any(), eq("income"), eq("n"), eq("NOTE"));
    }

    // ---- the Decision tab's mandate ----------------------------------------------------------------------

    private String rankedStaff(int rank) {
        return TestTokens.build(Map.of("role", "UNDERWRITER", "userId", 50L, "fullName", "Una", "roleLabel", "Underwriter", "scope", "ALL", "rank", rank,
                "entitlements", List.of("mandates.view")));
    }

    @Test
    void theMandateIsRuleServicesLimitWithTheNextRoleAndTheReferralLock() throws Exception {
        LoanApplication referred = app(10L);
        referred.setStatus("REFERRED_TO_SENIOR");
        referred.setReferredToRole("COO");
        when(repository.findByApplicationRef("APP-1")).thenReturn(Optional.of(referred));
        when(ruleServiceClient.resolveMandateLimit("UNDERWRITER", 10L, "PERSONAL")).thenReturn(75000.0);
        when(roleLadderClient.ladder()).thenReturn(List.of(new RoleLadderClient.LadderRole("UNDERWRITER", "Underwriter", 1),
                new RoleLadderClient.LadderRole("SENIOR_UNDERWRITER", "Senior Underwriter", 2), new RoleLadderClient.LadderRole("COO", "Chief Operating Officer", 4)));

        get("/api/applications/APP-1/mandate", rankedStaff(1)).andExpect(status().isOk())
                .andExpect(jsonPath("$.limit").value(75000.0))
                .andExpect(jsonPath("$.nextRole.code").value("SENIOR_UNDERWRITER"))
                .andExpect(jsonPath("$.nextRole.label").value("Senior Underwriter"))
                .andExpect(jsonPath("$.lockedTo").value("Chief Operating Officer"));
        get("/api/applications/APP-1/mandate", rankedStaff(4)).andExpect(jsonPath("$.nextRole").value(nullValue()))
                .andExpect(jsonPath("$.lockedTo").value(nullValue()));
    }

    @Test
    void aRoleWithNoMandateRowHasLimitZero() throws Exception {
        when(ruleServiceClient.resolveMandateLimit(any(), any(), any())).thenReturn(null);
        get("/api/applications/APP-1/mandate", rankedStaff(1)).andExpect(status().isOk()).andExpect(jsonPath("$.limit").value(0))
                .andExpect(jsonPath("$.nextRole").value(nullValue())).andExpect(jsonPath("$.lockedTo").value(nullValue()));
    }

    @Test
    void theMandateReadIs503WhenRuleServiceIsDown() throws Exception {
        when(ruleServiceClient.resolveMandateLimit(any(), any(), any())).thenThrow(new WorkflowUnavailableException(null));
        get("/api/applications/APP-1/mandate", rankedStaff(1)).andExpect(status().isServiceUnavailable());
    }

    // ---- the backfill -----------------------------------------------------------------------------------

    @Test
    void theBackfillRunsForAnAdminAndReportsItsCounts() throws Exception {
        when(workflowCases.backfillAll()).thenReturn(Map.of("created", 2, "updated", 1, "failed", List.of(), "batches", 1));
        String admin = TestTokens.build(Map.of("role", "ADMIN", "userId", 1L, "roleLabel", "Admin", "entitlements", List.of()));
        post("/api/applications/admin/workflow-backfill", "{}", admin).andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(2)).andExpect(jsonPath("$.updated").value(1));
        post("/api/applications/admin/workflow-backfill", "{}", TestTokens.staff(50, "UNDERWRITER", "ALL", null, "case.approve")).andExpect(status().isForbidden());
        post("/api/applications/admin/workflow-backfill", "{}", TestTokens.customer(OWNER)).andExpect(status().isForbidden());
        verify(workflowCases, times(1)).backfillAll();
    }
}
