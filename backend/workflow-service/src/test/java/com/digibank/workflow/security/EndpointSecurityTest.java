package com.digibank.workflow.security;

import com.digibank.workflow.service.AssignmentService;
import com.digibank.workflow.service.AuditSink;
import com.digibank.workflow.service.CaseService;
import com.digibank.workflow.service.DefinitionService;
import com.digibank.workflow.service.TransitionService;
import com.digibank.workflow.service.Visibility;
import com.digibank.workflow.web.AdminWorkflowController;
import com.digibank.workflow.web.ApiErrors;
import com.digibank.workflow.web.WorkflowController;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Drives the real security chain with real signed tokens: 401 anonymous, ADMIN-only admin API, entitlement-gated assignment routes. */
@WebMvcTest(controllers = {WorkflowController.class, AdminWorkflowController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class, JsonAccessDeniedHandler.class, ApiErrors.class})
@TestPropertySource(properties = {
        "app.jwt.secret=test-secret-test-secret-test-secret-0123456789",
        "app.auth-service.url=http://localhost:1",
        "eureka.client.enabled=false", "spring.cloud.discovery.enabled=false"
})
class EndpointSecurityTest {

    static final String SECRET = "test-secret-test-secret-test-secret-0123456789";

    @Autowired MockMvc mvc;
    @MockitoBean SessionRevocationCache revocation;
    @MockitoBean DefinitionService definitions;
    @MockitoBean TransitionService transitions;
    @MockitoBean AssignmentService assignment;
    @MockitoBean CaseService cases;
    @MockitoBean Visibility visibility;
    @MockitoBean AuditSink audit;

    static String token(Map<String, Object> claims) {
        Date now = new Date();
        return "Bearer " + Jwts.builder().setClaims(new HashMap<>(claims)).setSubject("uuid").setIssuedAt(now)
                .setExpiration(new Date(now.getTime() + 3_600_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes()), SignatureAlgorithm.HS256).compact();
    }

    static String staff(String role, String... entitlements) {
        Map<String, Object> c = new HashMap<>();
        c.put("role", role);
        c.put("userId", 5L);
        c.put("fullName", "Staff 5");
        c.put("entitlements", new ArrayList<>(List.of(entitlements)));
        c.put("scope", "ALL");
        c.put("orgUnitId", 3L);
        return token(c);
    }

    static String customer() {
        return token(Map.of("role", "CUSTOMER", "userId", 9L, "fullName", "Customer 9"));
    }

    @Test
    void anonymousCallsAreRefusedWith401() throws Exception {
        mvc.perform(get("/api/workflow/definition")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/workflow/cases/A-1/actions")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/admin/workflow/catalog")).andExpect(status().isUnauthorized());
        verifyNoInteractions(transitions, definitions);
    }

    @Test
    void aTamperedOrWrongSecretTokenIsRefused() throws Exception {
        String forged = Jwts.builder().setClaims(Map.of("role", "ADMIN", "userId", 1L)).setSubject("x").setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(Keys.hmacShaKeyFor("another-secret-another-secret-another-secret-12".getBytes()), SignatureAlgorithm.HS256).compact();
        mvc.perform(get("/api/auth/admin/workflow/catalog").header("Authorization", "Bearer " + forged)).andExpect(status().isUnauthorized());
    }

    @Test
    void theAdminApiIsAdminOnly() throws Exception {
        mvc.perform(get("/api/auth/admin/workflow/catalog").header("Authorization", staff("UNDERWRITER", "case.assign")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/admin/workflow/catalog").header("Authorization", customer())).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/admin/workflow/validate").header("Authorization", staff("UNDERWRITER")).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/admin/workflow/catalog").header("Authorization", staff("ADMIN"))).andExpect(status().isOk());
    }

    @Test
    void listingAndAssigningAreGatedByTheCaseAssignEntitlementNotTheRoleName() throws Exception {
        mvc.perform(get("/api/workflow/cases/A-1/eligible").header("Authorization", staff("HEAD_OF_LENDING", "queue.pipeline")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/workflow/cases/A-1/eligible").header("Authorization", customer())).andExpect(status().isForbidden());
        mvc.perform(post("/api/workflow/cases/A-1/assign").header("Authorization", staff("UNDERWRITER")).contentType(MediaType.APPLICATION_JSON).content("{\"userId\":2}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(assignment);

        mvc.perform(get("/api/workflow/cases/A-1/eligible").header("Authorization", staff("SENIOR_UNDERWRITER", "case.assign")))
                .andExpect(status().isOk());
        mvc.perform(post("/api/workflow/cases/A-1/assign").header("Authorization", staff("SENIOR_UNDERWRITER", "case.assign")).contentType(MediaType.APPLICATION_JSON).content("{\"userId\":2}"))
                .andExpect(status().isOk());
    }

    @Test
    void anySignedInCallerReachesTheRuntimeApiWhereTheServiceAppliesTheFinerRules() throws Exception {
        mvc.perform(get("/api/workflow/definition").header("Authorization", customer())).andExpect(status().isOk());
        mvc.perform(get("/api/workflow/availability").header("Authorization", staff("UNDERWRITER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.available").exists());
    }

    @Test
    void healthAndInternalPathsNeedNoToken() throws Exception {
        // /internal/** is service-to-service (no gateway route); the matcher is permitAll, so an unmapped path is a 404, not a 401.
        mvc.perform(get("/internal/workflow/unknown")).andExpect(status().isNotFound());
    }
}
