package com.digibank.rule.mandates;

import com.digibank.rule.directory.AuthDirectory.LadderRole;
import com.digibank.rule.directory.DirectoryUnavailableException;
import com.digibank.rule.security.JsonAccessDeniedHandler;
import com.digibank.rule.security.JsonAuthenticationEntryPoint;
import com.digibank.rule.security.JwtAuthenticationFilter;
import com.digibank.rule.security.SecurityConfig;
import com.digibank.rule.security.SessionRevocationCache;
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
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The real security configuration and token filter with real signed tokens, and the JSON the Admin Mandates page reads. */
@WebMvcTest(controllers = {MandateAdminController.class, MandateResolveController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class, JsonAccessDeniedHandler.class})
@TestPropertySource(properties = {
        "app.jwt.secret=" + MandateWebTest.SECRET, "app.auth-service.url=http://localhost:1",
        "eureka.client.enabled=false", "spring.cloud.discovery.enabled=false"
})
class MandateWebTest {

    static final String SECRET = "test-secret-test-secret-test-secret-0123456789";
    static final String BODY = "{\"roleCode\":\"UNDERWRITER\",\"orgUnitId\":null,\"applicationType\":null,\"maxAmount\":10}";

    @Autowired MockMvc mvc;
    @MockitoBean SessionRevocationCache revocation;
    @MockitoBean MandateAdminService admin;
    @MockitoBean MandateResolveService resolve;

    final ObjectMapper json = new ObjectMapper();

    static String token(String role, long userId, Instant issuedAt, Date expires) {
        return Jwts.builder().setSubject("uuid-" + userId).claim("role", role).claim("userId", userId)
                .claim("fullName", "Ada Admin").claim("email", "ada@example.com")
                .setIssuedAt(Date.from(issuedAt)).setExpiration(expires)
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)), SignatureAlgorithm.HS256).compact();
    }

    static String token(String role) {
        return token(role, 1, Instant.now(), new Date(System.currentTimeMillis() + 3_600_000));
    }

    private static Set<String> keys(JsonNode n) {
        Set<String> out = new TreeSet<>();
        n.propertyNames().forEach(out::add);
        return out;
    }

    // ---- who may call

    @Test
    void everyAdminEndpointRefusesNoTokenWith401() throws Exception {
        mvc.perform(get("/api/auth/admin/mandates")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/admin/mandates").contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/auth/admin/mandates/1").contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/auth/admin/mandates/1")).andExpect(status().isUnauthorized());
        verifyNoInteractions(admin);
    }

    @Test
    void everyAdminEndpointRefusesANonAdminEvenOneHoldingEverything() throws Exception {
        for (String role : List.of("UNDERWRITER", "CEO", "BANKER", "CUSTOMER")) {
            String bearer = "Bearer " + token(role);
            mvc.perform(get("/api/auth/admin/mandates").header("Authorization", bearer)).andExpect(status().isForbidden());
            mvc.perform(post("/api/auth/admin/mandates").header("Authorization", bearer).contentType(MediaType.APPLICATION_JSON).content(BODY))
                    .andExpect(status().isForbidden());
            mvc.perform(put("/api/auth/admin/mandates/1").header("Authorization", bearer).contentType(MediaType.APPLICATION_JSON).content(BODY))
                    .andExpect(status().isForbidden());
            mvc.perform(delete("/api/auth/admin/mandates/1").header("Authorization", bearer)).andExpect(status().isForbidden());
        }
        verifyNoInteractions(admin);
    }

    @Test
    void anExpiredForgedOrRevokedTokenIsA401() throws Exception {
        String expired = token("ADMIN", 1, Instant.now().minusSeconds(7200), new Date(System.currentTimeMillis() - 3_600_000));
        mvc.perform(get("/api/auth/admin/mandates").header("Authorization", "Bearer " + expired)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/admin/mandates").header("Authorization", "Bearer " + token("ADMIN") + "x")).andExpect(status().isUnauthorized());

        when(revocation.isRevoked(eq(1L), any())).thenReturn(true);
        mvc.perform(get("/api/auth/admin/mandates").header("Authorization", "Bearer " + token("ADMIN"))).andExpect(status().isUnauthorized());
    }

    @Test
    void anAdminTokenReachesTheServiceAndTheActorIsTheNamedUser() throws Exception {
        when(admin.create(any(), any())).thenReturn(new Mandate("UNDERWRITER", null, null, 10));
        mvc.perform(post("/api/auth/admin/mandates").header("Authorization", "Bearer " + token("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isCreated());
        verify(admin).create(any(), eq(new MandateAdminService.Actor("Ada Admin", "ADMIN")));
    }

    @Test
    void theInternalResolveEndpointIsOpenInsideTheNetworkLikeTheRestOfInternal() throws Exception {
        when(resolve.resolve("UNDERWRITER", 3L, "PERSONAL")).thenReturn(new MandateResolver.Resolved(500d, 2L, null));
        MvcResult r = mvc.perform(get("/internal/rules/mandates/resolve?role=UNDERWRITER&orgUnitId=3&applicationType=PERSONAL"))
                .andExpect(status().isOk()).andReturn();
        JsonNode b = json.readTree(r.getResponse().getContentAsString());
        assertThat(keys(b)).containsExactly("applicationType", "limit", "orgUnitId");
        assertThat(b.get("limit").asDouble()).isEqualTo(500d);
        assertThat(b.get("orgUnitId").asLong()).isEqualTo(2L);
        assertThat(b.get("applicationType").isNull()).isTrue();
    }

    @Test
    void noApplicableRowResolvesToANullLimit() throws Exception {
        when(resolve.resolve(eq("COO"), any(), any())).thenReturn(new MandateResolver.Resolved(null, null, null));
        JsonNode b = json.readTree(mvc.perform(get("/internal/rules/mandates/resolve?role=COO")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(b.get("limit").isNull()).isTrue();
        verify(resolve).resolve("COO", null, null);
    }

    @Test
    void whenTheOrgDirectoryIsDownTheResolveIsA503NotAGuess() throws Exception {
        when(resolve.resolve(any(), anyLong(), any())).thenThrow(new DirectoryUnavailableException("down", null));
        MvcResult r = mvc.perform(get("/internal/rules/mandates/resolve?role=UNDERWRITER&orgUnitId=3")).andExpect(status().isServiceUnavailable()).andReturn();
        JsonNode b = json.readTree(r.getResponse().getContentAsString());
        assertThat(b.get("success").asBoolean()).isFalse();
        assertThat(b.get("data").isNull()).isTrue();
    }

    // ---- the Worker's JSON and statuses

    @Test
    void listHasMandatesAndLadderWithTheWorkersKeys() throws Exception {
        when(admin.overview()).thenReturn(new MandateAdminService.Overview(
                List.of(new Mandate("UNDERWRITER", 2L, "BUSINESS", 99.5)), List.of(new LadderRole("UNDERWRITER", "Underwriter", 1))));
        JsonNode b = json.readTree(mvc.perform(get("/api/auth/admin/mandates").header("Authorization", "Bearer " + token("ADMIN")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(keys(b)).containsExactly("ladder", "mandates");
        assertThat(keys(b.get("mandates").get(0))).containsExactly("applicationType", "id", "maxAmount", "orgUnitId", "roleCode");
        assertThat(b.get("mandates").get(0).get("maxAmount").asDouble()).isEqualTo(99.5);
        assertThat(keys(b.get("ladder").get(0))).containsExactly("code", "label", "rank");
    }

    @Test
    void refusalsAreSuccessFalseMessageNullDataAtTheRulesOwnStatus() throws Exception {
        String bearer = "Bearer " + token("ADMIN");
        when(admin.create(any(), any())).thenThrow(new MandateApiException("Unknown org unit."));
        when(admin.update(eq(9L), any(), any())).thenThrow(new MandateApiException("Mandate not found.", 404));
        MvcResult bad = mvc.perform(post("/api/auth/admin/mandates").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isBadRequest()).andReturn();
        JsonNode b = json.readTree(bad.getResponse().getContentAsString());
        assertThat(keys(b)).containsExactly("data", "message", "success");
        assertThat(b.get("message").asString()).isEqualTo("Unknown org unit.");
        mvc.perform(put("/api/auth/admin/mandates/9").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isNotFound());
    }

    @Test
    void deleteAnswers204WithNoBodyAndUpdateAnswers200() throws Exception {
        String bearer = "Bearer " + token("ADMIN");
        when(admin.update(eq(1L), any(), any())).thenReturn(new Mandate("UNDERWRITER", null, null, 10));
        mvc.perform(put("/api/auth/admin/mandates/1").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isOk());
        MvcResult del = mvc.perform(delete("/api/auth/admin/mandates/1").header("Authorization", bearer)).andExpect(status().isNoContent()).andReturn();
        assertThat(del.getResponse().getContentAsString()).isEmpty();
        verify(admin).delete(eq(1L), any());
    }
}
