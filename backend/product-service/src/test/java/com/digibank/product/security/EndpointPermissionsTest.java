package com.digibank.product.security;

import com.digibank.product.catalog.CatalogController;
import com.digibank.product.catalog.CatalogService;
import com.digibank.product.preapproved.PreApprovedController;
import com.digibank.product.preapproved.PreApprovedOffer;
import com.digibank.product.preapproved.PreApprovedOfferService;
import com.digibank.product.selection.SelectionController;
import com.digibank.product.selection.SelectionService;
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
@WebMvcTest(controllers = {CatalogController.class, PreApprovedController.class, SelectionController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class, JsonAccessDeniedHandler.class,
        com.digibank.product.config.GlobalExceptionHandler.class})
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
    @MockitoBean CatalogService catalogService;
    @MockitoBean PreApprovedOfferService preApprovedOfferService;
    @MockitoBean SelectionService selectionService;

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

    record Route(HttpMethod method, String path, String body) {}

    static final List<Route> ADMIN_ROUTES = List.of(
            new Route(HttpMethod.GET, "/api/products/admin/all", ""),
            new Route(HttpMethod.POST, "/api/products/admin", "{}"),
            new Route(HttpMethod.PUT, "/api/products/admin/1", "{}"),
            new Route(HttpMethod.DELETE, "/api/products/admin/1", ""));

    static final List<Route> OPEN_ROUTES = List.of(
            new Route(HttpMethod.POST, "/api/products/eligible", "{}"),
            new Route(HttpMethod.POST, "/api/products/select", "{}"),
            new Route(HttpMethod.GET, "/api/products/selection/APP-1", ""),
            new Route(HttpMethod.POST, "/api/products/pre-approved/lookup", "{\"nationalId\":\"1\"}"),
            new Route(HttpMethod.POST, "/api/products/pre-approved/1/consume", ""));

    @Test
    void everyRouteRejectsAnUnauthenticatedCaller() throws Exception {
        for (Route r : ADMIN_ROUTES) assertThat(call(r.method(), r.path(), null, r.body())).as(r.method() + " " + r.path()).isEqualTo(401);
        for (Route r : OPEN_ROUTES) assertThat(call(r.method(), r.path(), null, r.body())).as(r.method() + " " + r.path()).isEqualTo(401);
    }

    @Test
    void theAdminRoutesAreForTheAdminRoleOnly() throws Exception {
        for (Route r : ADMIN_ROUTES) {
            for (String role : List.of("CUSTOMER", "UNDERWRITER", "BANKER", "BUSINESS_OWNER")) {
                assertThat(call(r.method(), r.path(), token(role), r.body())).as(role + " " + r.method() + " " + r.path()).isEqualTo(403);
            }
            assertThat(call(r.method(), r.path(), token("ADMIN"), r.body())).as("ADMIN " + r.method() + " " + r.path()).isNotIn(401, 403);
        }
    }

    @Test
    void theCustomerFacingRoutesAreOpenToAnyAuthenticatedUser() throws Exception {
        for (Route r : OPEN_ROUTES) {
            assertThat(call(r.method(), r.path(), token("CUSTOMER"), r.body())).as(r.method() + " " + r.path()).isNotIn(401, 403);
        }
    }

    @Test
    void lookupValidationUsesTheWorkersMessages() throws Exception {
        String t = token("CUSTOMER");
        mvc.perform(request(HttpMethod.POST, "/api/products/pre-approved/lookup").header("Authorization", "Bearer " + t)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Invalid request: nationalId: Required"));
        mvc.perform(request(HttpMethod.POST, "/api/products/pre-approved/lookup").header("Authorization", "Bearer " + t)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"nationalId\":\"\"}"))
                .andExpect(jsonPath("$.message").value("Invalid request: nationalId: String must contain at least 1 character(s)"));
        mvc.perform(request(HttpMethod.POST, "/api/products/pre-approved/lookup").header("Authorization", "Bearer " + t)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"nationalId\":\"1\",\"extra\":1}"))
                .andExpect(jsonPath("$.message").value("Invalid request: (root): Unrecognized key(s) in object: 'extra'"));
    }

    @Test
    void lookupAnswers404WithAnEmptyBodyWhenThereIsNoOffer() throws Exception {
        when(preApprovedOfferService.getPreApprovedOffer("1")).thenReturn(null);
        var res = mvc.perform(request(HttpMethod.POST, "/api/products/pre-approved/lookup").header("Authorization", "Bearer " + token("CUSTOMER"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"nationalId\":\"1\"}")).andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(404);
        assertThat(res.getContentAsString()).isEmpty();
        when(preApprovedOfferService.getPreApprovedOffer("2")).thenReturn(new PreApprovedOffer());
        mvc.perform(request(HttpMethod.POST, "/api/products/pre-approved/lookup").header("Authorization", "Bearer " + token("CUSTOMER"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"nationalId\":\"2\"}")).andExpect(status().isOk());
    }

    @Test
    void aBusinessRuleViolationIs400WithTheWorkersBody() throws Exception {
        when(selectionService.getSelection("APP-9")).thenThrow(new IllegalArgumentException("No product selected for application: APP-9"));
        mvc.perform(request(HttpMethod.GET, "/api/products/selection/APP-9").header("Authorization", "Bearer " + token("CUSTOMER")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("No product selected for application: APP-9"));
    }

    @Test
    void theTokenFilterIsRegisteredOnlyInsideTheSecurityChain() {
        assertThat(filterRegistration.isEnabled()).isFalse();
    }
}
