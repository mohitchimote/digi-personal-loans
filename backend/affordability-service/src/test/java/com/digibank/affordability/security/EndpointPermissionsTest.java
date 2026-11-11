package com.digibank.affordability.security;

import com.digibank.affordability.assessment.AffordabilityService;
import com.digibank.affordability.assessment.AssessmentController;
import com.digibank.affordability.assessment.BusinessAffordabilityService;
import com.digibank.affordability.client.RuleServiceClient;
import com.digibank.affordability.rules.AffordabilityRules;
import com.digibank.affordability.rules.RulesController;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The real security configuration and token filter, driven with real signed tokens. */
@WebMvcTest(controllers = {AssessmentController.class, RulesController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class, JsonAccessDeniedHandler.class,
        com.digibank.affordability.config.GlobalExceptionHandler.class})
@TestPropertySource(properties = {
        "app.jwt.secret=test-secret-test-secret-test-secret-0123456789",
        "app.auth-service.url=http://localhost:1",
        "eureka.client.enabled=false", "spring.cloud.discovery.enabled=false"
})
class EndpointPermissionsTest {

    static final String SECRET = "test-secret-test-secret-test-secret-0123456789";

    @Autowired MockMvc mvc;
    @Autowired FilterRegistrationBean<JwtAuthenticationFilter> filterRegistration;
    @MockitoBean SessionRevocationCache revocation;
    @MockitoBean AffordabilityService affordabilityService;
    @MockitoBean BusinessAffordabilityService businessAffordabilityService;
    @MockitoBean RuleServiceClient ruleServiceClient;

    private static String token(String role) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", role);
        claims.put("userId", 5L);
        Date now = new Date();
        return Jwts.builder().setClaims(claims).setSubject("uuid-5").setIssuedAt(now)
                .setExpiration(new Date(now.getTime() + 3_600_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes()), SignatureAlgorithm.HS256).compact();
    }

    private int call(HttpMethod method, String path, String bearer, String json) throws Exception {
        MockHttpServletRequestBuilder b = request(method, path).contentType(MediaType.APPLICATION_JSON).content(json);
        if (bearer != null) b.header("Authorization", "Bearer " + bearer);
        return mvc.perform(b).andReturn().getResponse().getStatus();
    }

    private static final String PERSONAL = "{\"monthlyGrossIncome\":10000,\"monthlyNetIncome\":7000,\"requestedLoanAmount\":20000,\"requestedTermMonths\":24}";
    private static final String BUSINESS = "{\"annualTurnover\":1200000,\"monthlyRevenue\":100000,\"requestedLoanAmount\":50000,\"requestedTermMonths\":24}";

    @Test
    void everyRouteRejectsAnUnauthenticatedCaller() throws Exception {
        assertThat(call(HttpMethod.POST, "/api/affordability/check", null, PERSONAL)).isEqualTo(401);
        assertThat(call(HttpMethod.POST, "/api/affordability/check-business", null, BUSINESS)).isEqualTo(401);
        assertThat(call(HttpMethod.GET, "/api/affordability/rules", null, "")).isEqualTo(401);
        assertThat(call(HttpMethod.PUT, "/api/affordability/rules", null, "{}")).isEqualTo(401);
    }

    @Test
    void anyAuthenticatedUserMayAssessAndReadTheRules() throws Exception {
        when(ruleServiceClient.getAffordabilityRules()).thenReturn(new AffordabilityRules());
        for (String role : List.of("CUSTOMER", "BUSINESS_OWNER", "UNDERWRITER")) {
            assertThat(call(HttpMethod.POST, "/api/affordability/check", token(role), PERSONAL)).as(role).isNotIn(401, 403);
            assertThat(call(HttpMethod.POST, "/api/affordability/check-business", token(role), BUSINESS)).as(role).isNotIn(401, 403);
            assertThat(call(HttpMethod.GET, "/api/affordability/rules", token(role), "")).as(role).isEqualTo(200);
        }
    }

    @Test
    void changingTheRulesIsForTheAdminRoleOnly() throws Exception {
        when(ruleServiceClient.updateAffordabilityRules(org.mockito.ArgumentMatchers.any())).thenReturn(new AffordabilityRules());
        for (String role : List.of("CUSTOMER", "UNDERWRITER", "BANKER")) {
            assertThat(call(HttpMethod.PUT, "/api/affordability/rules", token(role), "{}")).as(role).isEqualTo(403);
        }
        assertThat(call(HttpMethod.PUT, "/api/affordability/rules", token("ADMIN"), "{}")).isEqualTo(200);
    }

    @Test
    void aMissingRequiredFieldIs400WithTheWorkersBody() throws Exception {
        mvc.perform(request(HttpMethod.POST, "/api/affordability/check").header("Authorization", "Bearer " + token("CUSTOMER"))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data").isEmpty());
    }

    @Test
    void theTokenFilterIsRegisteredOnlyInsideTheSecurityChain() {
        assertThat(filterRegistration.isEnabled()).isFalse();
    }
}
