package com.digibank.application.security;

import com.digibank.application.audittrail.AuditTrailService;
import com.digibank.application.audittrail.NotesController;
import com.digibank.application.businessfinancials.BusinessFinancialsAnalysisService;
import com.digibank.application.businessfinancials.BusinessFinancialsController;
import com.digibank.application.client.AuthServiceOrgClient;
import com.digibank.application.client.RoleLadderClient;
import com.digibank.application.client.RuleServiceClient;
import com.digibank.application.client.WorkflowClient;
import com.digibank.application.dataverification.DataVerificationController;
import com.digibank.application.dataverification.DataVerificationService;
import com.digibank.application.decisioning.DecisioningController;
import com.digibank.application.decisioning.DecisioningService;
import com.digibank.application.decisioning.StaffQueueController;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.org.OrgScope;
import com.digibank.application.org.OrgUnitInfo;
import com.digibank.application.repository.CaseReferralRepository;
import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.repository.UnderwritingNoteRepository;
import com.digibank.application.wizard.WizardController;
import com.digibank.application.workflow.WorkflowActionController;
import com.digibank.application.workflow.WorkflowAdminController;
import com.digibank.application.wizard.WizardService;
import com.digibank.application.workflow.QueueService;
import com.digibank.application.workflow.QueueSettings;
import com.digibank.application.workflow.WorkflowActions;
import com.digibank.application.workflow.WorkflowCases;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Who may touch a case, through the real security configuration, real signed tokens, the real
 * CaseAccess and OrgScope (only the repository, the org directory and the services behind the
 * controllers are mocked). Customer-side actions are for the owner or staff holding case.actAsCustomer;
 * reads and staff actions are limited by ownership (customers) or org scope (staff).
 */
@WebMvcTest(controllers = {WizardController.class, DecisioningController.class, NotesController.class,
        DataVerificationController.class, BusinessFinancialsController.class, StaffQueueController.class,
        WorkflowActionController.class, WorkflowAdminController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class,
        JsonAccessDeniedHandler.class, CaseAccess.class, OrgScope.class, QueueService.class})
@TestPropertySource(properties = {
        "app.jwt.secret=" + TestTokens.SECRET,
        "app.auth-service.url=http://localhost:1",
        "eureka.client.enabled=false", "spring.cloud.discovery.enabled=false"
})
class CaseOwnershipTest {

    static final String NOT_OWNER = "You can only act on your own applications.";
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

    record Call(HttpMethod method, String path, String body) {
        @Override public String toString() { return method + " " + path; }
    }

    static final List<Call> CUSTOMER_ACTIONS = List.of(
            new Call(HttpMethod.PUT, "/api/applications/APP-1/section", "{\"section\":\"loanRequirements\",\"data\":{}}"),
            new Call(HttpMethod.POST, "/api/applications/APP-1/submit", "{}"),
            new Call(HttpMethod.POST, "/api/applications/APP-1/withdraw", "{}"),
            new Call(HttpMethod.POST, "/api/applications/APP-1/cancel", "{}"),
            new Call(HttpMethod.POST, "/api/applications/APP-1/select-product", "{\"productId\":\"P1\"}"),
            new Call(HttpMethod.PUT, "/api/applications/APP-1/affordability-result", "{\"passed\":true}"));

    private LoanApplication app(Long orgUnitId) {
        LoanApplication a = LoanApplication.builder().applicationRef("APP-1").customerId(OWNER).customerEmail("o@x.test")
                .status("IN_PROGRESS").applicationType("PERSONAL").orgUnitId(orgUnitId).build();
        return a;
    }

    @BeforeEach
    void caseExists() {
        when(repository.findByApplicationRef("APP-1")).thenReturn(Optional.of(app(10L)));
        when(repository.findByApplicationRef("MISSING")).thenReturn(Optional.empty());
        when(orgClient.units()).thenReturn(List.of(
                new OrgUnitInfo(1L, null, 1L, "Bank", "BANK", true),
                new OrgUnitInfo(10L, 1L, 2L, "Region", "R", true),
                new OrgUnitInfo(11L, 10L, 3L, "Branch", "B", true),
                new OrgUnitInfo(20L, 1L, 2L, "Other region", "R2", true)));
        when(wizardService.view(any())).thenReturn(Map.of("applicationRef", "APP-1"));
    }

    private ResultActions send(Call c, String token) throws Exception {
        MockHttpServletRequestBuilder b = request(c.method(), c.path()).contentType(MediaType.APPLICATION_JSON).content(c.body());
        if (token != null) b.header("Authorization", "Bearer " + token);
        return mvc.perform(b);
    }

    private ResultActions get(String path, String token) throws Exception {
        return mvc.perform(request(HttpMethod.GET, path).header("Authorization", "Bearer " + token));
    }

    // ---- customer-side actions: owner or case.actAsCustomer -------------------------------------

    @Test
    void theOwningCustomerMayActOnTheirOwnCase() throws Exception {
        for (Call c : CUSTOMER_ACTIONS) {
            send(c, TestTokens.customer(OWNER)).andExpect(status().isOk());
        }
        verify(wizardService).saveSection(eq("APP-1"), any(), anyString(), anyMap());
        verify(wizardService).submitApplication(eq("APP-1"), any());
        verify(wizardService).withdrawApplication(eq("APP-1"), any());
        verify(wizardService).cancelApplication(eq("APP-1"), any());
        verify(wizardService).selectProduct(eq("APP-1"), any(), anyMap());
        verify(wizardService).saveAffordabilityResult(eq("APP-1"), anyMap());
    }

    @Test
    void anotherCustomerIsRefusedEveryCustomerSideAction() throws Exception {
        for (Call c : CUSTOMER_ACTIONS) {
            send(c, TestTokens.customer(8L)).andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value(NOT_OWNER))
                    .andExpect(jsonPath("$.success").value(false));
        }
        verifyNoInteractions(wizardService);
    }

    @Test
    void staffWithoutActAsCustomerAreRefused() throws Exception {
        String token = TestTokens.staff(50, "UNDERWRITER", "ALL", null, "case.approve", "case.editSection", "queue.pipeline");
        for (Call c : CUSTOMER_ACTIONS) {
            send(c, token).andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value(NOT_OWNER));
        }
        verifyNoInteractions(wizardService);
    }

    @Test
    void staffHoldingActAsCustomerMayAssist() throws Exception {
        String token = TestTokens.staff(51, "BANKER", "ALL", null, "case.actAsCustomer");
        for (Call c : CUSTOMER_ACTIONS) send(c, token).andExpect(status().isOk());
        verify(wizardService).submitApplication(eq("APP-1"), any());
    }

    @Test
    void anUnknownReferenceIsStillA400BeforeOwnershipCanBeJudged() throws Exception {
        send(new Call(HttpMethod.POST, "/api/applications/MISSING/submit", "{}"), TestTokens.customer(8L))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Application not found: MISSING"));
    }

    // ---- starting and listing: the customer's own id, or staff ---------------------------------

    @Test
    void aCustomerCannotStartAnApplicationForSomeoneElse() throws Exception {
        Call start = new Call(HttpMethod.POST, "/api/applications/start", "{\"customerId\":7,\"customerEmail\":\"o@x.test\"}");
        send(start, TestTokens.customer(8L)).andExpect(status().isForbidden());
        verifyNoInteractions(wizardService);
        for (String path : List.of("/api/applications/start-business", "/api/applications/start-pre-approved")) {
            send(new Call(HttpMethod.POST, path, "{\"customerId\":7,\"customerEmail\":\"o@x.test\",\"nationalId\":\"123456789\"}"),
                    TestTokens.customer(8L)).andExpect(status().isForbidden());
        }
        verifyNoInteractions(wizardService);
    }

    @Test
    void aCustomersOwnApplicationHasNoOrgUnitButABankerOpenedOneBelongsToTheBankersUnit() throws Exception {
        Call start = new Call(HttpMethod.POST, "/api/applications/start", "{\"customerId\":7,\"customerEmail\":\"o@x.test\"}");
        send(start, TestTokens.customer(OWNER)).andExpect(status().isOk());
        verify(wizardService).createOrResumeApplication(7L, "o@x.test", null);

        send(start, TestTokens.staff(51, "BANKER", "UNIT_ONLY", 11L, "case.actAsCustomer")).andExpect(status().isOk());
        verify(wizardService).createOrResumeApplication(7L, "o@x.test", 11L);

        Call business = new Call(HttpMethod.POST, "/api/applications/start-business", "{\"customerId\":7,\"customerEmail\":\"o@x.test\"}");
        send(business, TestTokens.staff(51, "BANKER", "UNIT_ONLY", 11L, "case.actAsCustomer")).andExpect(status().isOk());
        verify(wizardService).createOrResumeBusinessApplication(7L, "o@x.test", 11L);
    }

    @Test
    void listingACustomersApplicationsIsForThatCustomerOrStaff() throws Exception {
        get("/api/applications/customer/7", TestTokens.customer(8L)).andExpect(status().isForbidden());
        get("/api/applications/customer/7/current", TestTokens.customer(8L)).andExpect(status().isForbidden());
        get("/api/applications/customer/7", TestTokens.customer(OWNER)).andExpect(status().isOk());
        get("/api/applications/customer/7", TestTokens.staff(50, "BANKER", "ALL", null, "queue.banker")).andExpect(status().isOk());
    }

    // ---- reads: owner, or staff in scope ---------------------------------------------------------

    @Test
    void readingACaseIsForItsOwnerOrStaffInScopeAndOtherwiseA404() throws Exception {
        get("/api/applications/APP-1", TestTokens.customer(OWNER)).andExpect(status().isOk());
        get("/api/applications/APP-1", TestTokens.customer(8L)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Application not found."));

        get("/api/applications/APP-1", TestTokens.staff(50, "UNDERWRITER", "ALL", 20L)).andExpect(status().isOk());
        get("/api/applications/APP-1", TestTokens.staff(50, "UNDERWRITER", "UNIT_ONLY", 10L)).andExpect(status().isOk());
        get("/api/applications/APP-1", TestTokens.staff(50, "UNDERWRITER", "UNIT_ONLY", 11L)).andExpect(status().isNotFound());
        get("/api/applications/APP-1", TestTokens.staff(50, "UNDERWRITER", "UNIT_ONLY", 20L)).andExpect(status().isNotFound());
        get("/api/applications/APP-1", TestTokens.staff(50, "UNDERWRITER", "UNIT_TREE", 1L)).andExpect(status().isOk());
        get("/api/applications/APP-1", TestTokens.staff(50, "UNDERWRITER", "UNIT_TREE", 20L)).andExpect(status().isNotFound());
        // a person with no org unit stays unrestricted whatever the role's scope says
        get("/api/applications/APP-1", TestTokens.staff(50, "UNDERWRITER", "UNIT_ONLY", null)).andExpect(status().isOk());
    }

    @Test
    void aCaseWithNoOrgUnitIsVisibleToAllStaff() throws Exception {
        when(repository.findByApplicationRef("APP-1")).thenReturn(Optional.of(app(null)));
        get("/api/applications/APP-1", TestTokens.staff(50, "UNDERWRITER", "UNIT_ONLY", 20L)).andExpect(status().isOk());
    }

    @Test
    void notesAndTheUnderwritersPanelsFollowTheSameVisibility() throws Exception {
        String stranger = TestTokens.customer(8L);
        String outOfScope = TestTokens.staff(50, "UNDERWRITER", "UNIT_ONLY", 20L, "case.addNote", "case.resolveVerification");
        for (String path : List.of("/api/applications/APP-1/notes", "/api/applications/APP-1/data-verification",
                "/api/applications/APP-1/business-financials-analysis")) {
            get(path, stranger).andExpect(status().isNotFound());
            get(path, outOfScope).andExpect(status().isNotFound());
        }
        verifyNoInteractions(auditTrailService, dataVerificationService, businessFinancialsAnalysisService);
        for (String path : List.of("/api/applications/APP-1/notes", "/api/applications/APP-1/data-verification",
                "/api/applications/APP-1/business-financials-analysis")) {
            get(path, TestTokens.customer(OWNER)).andExpect(status().is(org.hamcrest.Matchers.not(404)));
        }
    }

    @Test
    void everyStaffActionNeedsTheCaseToBeInScope() throws Exception {
        String all = TestTokens.staff(50, "UNDERWRITER", "UNIT_ONLY", 20L, "case.addNote", "case.editSection", "case.approve",
                "case.decline", "case.sendBack", "case.refer", "case.disburse", "case.disburseSecondCheck", "case.resolveVerification",
                "mandates.view");
        List<Call> staff = List.of(
                new Call(HttpMethod.POST, "/api/applications/APP-1/notes", "{\"section\":\"s\",\"note\":\"n\"}"),
                new Call(HttpMethod.PUT, "/api/applications/APP-1/section-by-underwriter", "{\"section\":\"loanRequirements\",\"data\":{}}"),
                new Call(HttpMethod.POST, "/api/applications/APP-1/approve", "{}"),
                new Call(HttpMethod.POST, "/api/applications/APP-1/approve-by-underwriter", "{\"approvedAmount\":1000}"),
                new Call(HttpMethod.POST, "/api/applications/APP-1/decline", "{\"reason\":\"r\"}"),
                new Call(HttpMethod.POST, "/api/applications/APP-1/send-back", "{\"reason\":\"r\"}"),
                new Call(HttpMethod.POST, "/api/applications/APP-1/refer-to-senior", "{\"reason\":\"r\"}"),
                new Call(HttpMethod.POST, "/api/applications/APP-1/disbursement/authorise", "{}"),
                new Call(HttpMethod.POST, "/api/applications/APP-1/disbursement/second-check", "{}"),
                new Call(HttpMethod.POST, "/api/applications/APP-1/data-verification/resolve", "{\"ruleKey\":\"k\",\"action\":\"APPROVE\",\"reviewedBy\":\"x\"}"));
        for (Call c : staff) send(c, all).andExpect(status().isNotFound());
        get("/api/applications/APP-1/mandate", all).andExpect(status().isNotFound());
        get("/api/applications/APP-1/referrals", all).andExpect(status().isNotFound());
        verifyNoInteractions(decisioningService, auditTrailService, dataVerificationService);
        verify(wizardService, never()).saveSectionByUnderwriter(any(), any(), any(), any());
    }

    @Test
    void aCustomerCannotReadReferrals() throws Exception {
        get("/api/applications/APP-1/referrals", TestTokens.customer(OWNER)).andExpect(status().isForbidden());
    }

    // ---- queues are filtered by scope --------------------------------------------------------------

    private LoanApplication caseIn(String ref, Long unit) {
        LoanApplication a = LoanApplication.builder().applicationRef(ref).customerId(1L).customerEmail("c@x.test").orgUnitId(unit).build();
        return a;
    }

    static final List<String> PIPELINE = List.of("SUBMITTED", "UNDER_REVIEW", "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR", "APPROVED");
    static final List<String> BANKER = List.of("DRAFT", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR", "APPROVED");
    static final List<String> HOME_STAFF = List.of("SUBMITTED", "UNDER_REVIEW", "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR", "APPROVED", "DECLINED", "IN_PROGRESS");
    static final List<String> HOME_BANKER = List.of("DRAFT", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "CONDITIONALLY_APPROVED", "REFERRED_TO_SENIOR", "APPROVED", "DECLINED");

    @Test
    void thePipelineAndBankerQueueAreFilteredByTheCallersScope() throws Exception {
        List<LoanApplication> all = List.of(caseIn("A-10", 10L), caseIn("A-11", 11L), caseIn("A-20", 20L), caseIn("A-NONE", null));
        when(workflowClient.resolveQueue(eq(List.of("pipeline")), any())).thenReturn(new QueueSettings("pipeline", PIPELINE, true, true));
        when(workflowClient.resolveQueue(eq(List.of("banker-queue")), any())).thenReturn(new QueueSettings("banker-queue", BANKER, true, true));
        when(repository.findByStatusInOrderBySubmittedAtAsc(PIPELINE)).thenReturn(all);
        when(repository.findByStatusInOrderByUpdatedAtDesc(BANKER)).thenReturn(all);

        String tree = TestTokens.staff(50, "UNDERWRITER", "UNIT_TREE", 10L, "queue.pipeline", "queue.banker");
        get("/api/applications/pipeline", tree).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].applicationRef", org.hamcrest.Matchers.contains("A-10", "A-11", "A-NONE")));
        get("/api/applications/banker-queue", tree).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].applicationRef", org.hamcrest.Matchers.contains("A-10", "A-11", "A-NONE")));

        String only = TestTokens.staff(50, "UNDERWRITER", "UNIT_ONLY", 10L, "queue.pipeline");
        get("/api/applications/pipeline", only).andExpect(jsonPath("$[*].applicationRef", org.hamcrest.Matchers.contains("A-10", "A-NONE")));

        String everything = TestTokens.staff(50, "UNDERWRITER", "ALL", 10L, "queue.pipeline");
        get("/api/applications/pipeline", everything).andExpect(jsonPath("$.length()").value(4));
    }

    @Test
    void homeStatsAreScopedAndTheListComesFromTheQueueWorkflowServiceResolves() throws Exception {
        when(repository.findByStatusInOrderByUpdatedAtDesc(any())).thenReturn(List.of(caseIn("A-10", 10L), caseIn("A-20", 20L)));
        when(workflowClient.resolveQueue(eq(List.of("home-stats-staff", "home-stats-banker")), any()))
                .thenReturn(new QueueSettings("home-stats-staff", HOME_STAFF, true, true));

        get("/api/applications/home-stats", TestTokens.staff(50, "UNDERWRITER", "UNIT_ONLY", 10L, "dashboard.view", "queue.pipeline"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[*].applicationRef", org.hamcrest.Matchers.contains("A-10")));
        verify(repository).findByStatusInOrderByUpdatedAtDesc(HOME_STAFF);

        when(workflowClient.resolveQueue(eq(List.of("home-stats-staff", "home-stats-banker")), any()))
                .thenReturn(new QueueSettings("home-stats-banker", HOME_BANKER, true, true));
        get("/api/applications/home-stats", TestTokens.staff(51, "BANKER", "ALL", 10L, "dashboard.view", "queue.banker"))
                .andExpect(status().isOk());
        verify(repository).findByStatusInOrderByUpdatedAtDesc(HOME_BANKER);
    }

    @Test
    void aQueueTheDefinitionDoesNotLetTheCallerOpenIsA403AndListsNothing() throws Exception {
        when(workflowClient.resolveQueue(any(), any())).thenThrow(new com.digibank.application.config.ApiException(403, "Forbidden."));
        get("/api/applications/home-stats", TestTokens.staff(50, "UNDERWRITER", "ALL", null, "dashboard.view"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value("Forbidden."));
        verify(repository, never()).findByStatusInOrderByUpdatedAtDesc(any());
    }

    // ---- the generic action route: the case must be visible to the caller -----------------------------

    @Test
    void theGenericActionRouteNeedsTheCaseToBeVisibleToTheCaller() throws Exception {
        Call decline = new Call(HttpMethod.POST, "/api/workflow/cases/APP-1/actions/decline", "{\"input\":{\"reason\":\"r\"}}");
        send(decline, TestTokens.customer(8L)).andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("Application not found."));
        send(decline, TestTokens.staff(50, "UNDERWRITER", "UNIT_ONLY", 20L, "case.decline")).andExpect(status().isNotFound());
        send(new Call(HttpMethod.POST, "/api/workflow/cases/MISSING/actions/decline", "{}"), TestTokens.staff(50, "UNDERWRITER", "ALL", null, "case.decline"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("Application not found."));
        verifyNoInteractions(workflowActions);
    }

    @Test
    void theGenericActionRouteRefusesTheActionsThatCarryFormData() throws Exception {
        for (String action : List.of("save_section", "edit_section", "select_product")) {
            send(new Call(HttpMethod.POST, "/api/workflow/cases/APP-1/actions/" + action, "{}"), TestTokens.customer(OWNER))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value(action + " carries form data and has its own endpoint."));
        }
        verifyNoInteractions(workflowActions);
    }
}
