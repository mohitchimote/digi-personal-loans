package com.digibank.auth.internal;

import com.digibank.auth.access.RoleConfig;
import com.digibank.auth.access.RoleConfigService;
import com.digibank.auth.access.Scope;
import com.digibank.auth.compliance.ComplianceAuditWriter;
import com.digibank.auth.access.OrgUnitRepository;
import com.digibank.auth.identity.AuthController;
import com.digibank.auth.identity.AuthService;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import com.digibank.auth.security.*;
import com.digibank.auth.staffadmin.UserAdminController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The real security configuration and the real token filter, with real signed tokens: who may call the internal
 * API, that the Worker's entitlement gates (not role names) now apply to register-by-staff and customer-profile,
 * and the validation added on the admin and language endpoints.
 */
@WebMvcTest(controllers = {InternalDirectoryController.class, AuthController.class, UserAdminController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, InternalKeyFilter.class, JwtTokenProvider.class,
        JsonAuthenticationEntryPoint.class, JsonAccessDeniedHandler.class})
@TestPropertySource(properties = {
        "app.jwt.secret=" + EndpointAccessTest.SECRET, "app.jwt.expiration=86400000",
        "eureka.client.enabled=false", "spring.cloud.discovery.enabled=false"
})
class EndpointAccessTest {

    static final String SECRET = "test-secret-test-secret-test-secret-0123456789";

    @Autowired MockMvc mvc;
    @Autowired JwtTokenProvider jwt;
    @MockitoBean AuthService authService; // also the UserDetailsService
    @MockitoBean UserRepository users;
    @MockitoBean RoleConfigService roles;
    @MockitoBean OrgUnitRepository orgUnits;
    @MockitoBean ComplianceAuditWriter audit;
    @MockitoBean InternalDirectoryService directory;

    final ObjectMapper json = new ObjectMapper();

    /** A signed-in person of the given role who holds the given entitlements. */
    private String tokenFor(String role, String... entitlements) {
        String uuid = "uuid-" + role + "-" + String.join("+", entitlements);
        User user = User.builder().email(role.toLowerCase() + "@example.com").nationalId("000000001").fullName("Pat").role(role).build();
        ReflectionTestUtils.setField(user, "uuid", uuid);
        ReflectionTestUtils.setField(user, "id", 7L);
        UserDetails details = org.springframework.security.core.userdetails.User.builder()
                .username(uuid).password("N/A").authorities(new SimpleGrantedAuthority("ROLE_" + role)).build();
        when(authService.loadUserByUsername(uuid)).thenReturn(details);
        when(users.findByUuid(uuid)).thenReturn(Optional.of(user));
        boolean staff = !role.equals("CUSTOMER") && !role.equals("BUSINESS_OWNER");
        when(roles.resolve(role)).thenReturn(staff
                ? new RoleConfig(role, role, true, Scope.ALL, null, Set.of(entitlements))
                : RoleConfig.notStaff(role));
        return "Bearer " + jwt.generateToken(details);
    }

    @BeforeEach
    void stubDirectory() {
        when(directory.orgUnits()).thenReturn(List.of());
        when(directory.ladder()).thenReturn(List.of());
        when(directory.roles()).thenReturn(List.of());
        when(directory.staff(any(), any())).thenReturn(List.of());
    }

    // ---- /api/auth/internal

    private static final List<String> INTERNAL_PATHS = List.of(
            "/api/auth/internal/org/units", "/api/auth/internal/roles/ladder", "/api/auth/internal/roles",
            "/api/auth/internal/roles/UNDERWRITER", "/api/auth/internal/staff", "/api/auth/internal/staff/7/availability");

    @Test
    void theInternalApiRefusesAnonymousCallersAndCustomers() throws Exception {
        String customer = tokenFor("CUSTOMER");
        String owner = tokenFor("BUSINESS_OWNER");
        for (String path : INTERNAL_PATHS) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(get(path).header("Authorization", customer)).andExpect(status().isForbidden());
            mvc.perform(get(path).header("Authorization", owner)).andExpect(status().isForbidden());
        }
        mvc.perform(put("/api/auth/internal/staff/7/availability").contentType(MediaType.APPLICATION_JSON).content("{\"available\":false}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(put("/api/auth/internal/staff/7/availability").header("Authorization", customer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"available\":false}")).andExpect(status().isForbidden());
        verifyNoInteractions(directory);
    }

    @Test
    void aWrongOrMissingInternalKeyIsNotEnough() throws Exception {
        for (String path : INTERNAL_PATHS) {
            mvc.perform(get(path).header(InternalKey.HEADER, "nope")).andExpect(status().isUnauthorized());
            mvc.perform(get(path).header(InternalKey.HEADER, InternalKey.derive(SECRET + "x"))).andExpect(status().isUnauthorized());
        }
        verifyNoInteractions(directory);
    }

    @Test
    void anotherServiceWithTheDerivedKeyMayCallEveryInternalEndpoint() throws Exception {
        when(directory.role(any())).thenReturn(new InternalDirectoryService.RoleConfigView("UNDERWRITER", "Underwriter", true, "ALL", 1, List.of()));
        when(directory.isAvailable(7)).thenReturn(true);
        for (String path : INTERNAL_PATHS) {
            mvc.perform(get(path).header(InternalKey.HEADER, InternalKey.derive(SECRET))).andExpect(status().isOk());
        }
    }

    @Test
    void signedInStaffOfAnyRoleNameMayCallTheInternalApi() throws Exception {
        when(directory.isAvailable(7)).thenReturn(true);
        mvc.perform(get("/api/auth/internal/org/units").header("Authorization", tokenFor("BRANCH_OFFICER"))).andExpect(status().isOk());
        mvc.perform(get("/api/auth/internal/roles/ladder").header("Authorization", tokenFor("UNDERWRITER"))).andExpect(status().isOk());
    }

    @Test
    void availabilityIsWrittenThroughTheInternalEndpointAndMustBeABoolean() throws Exception {
        when(directory.setAvailable(7, false)).thenReturn(false);
        String key = InternalKey.derive(SECRET);
        JsonNode ok = json.readTree(mvc.perform(put("/api/auth/internal/staff/7/availability").header(InternalKey.HEADER, key)
                .contentType(MediaType.APPLICATION_JSON).content("{\"available\":false}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(ok.get("available").asBoolean()).isFalse();
        for (String bad : List.of("{}", "{\"available\":\"yes\"}", "{\"available\":null}")) {
            JsonNode b = json.readTree(mvc.perform(put("/api/auth/internal/staff/7/availability").header(InternalKey.HEADER, key)
                    .contentType(MediaType.APPLICATION_JSON).content(bad)).andExpect(status().isBadRequest())
                    .andReturn().getResponse().getContentAsString());
            assertThat(b.get("message").asString()).isEqualTo("available must be true or false.");
        }
        verify(directory, times(1)).setAvailable(anyLong(), anyBoolean());
    }

    // ---- entitlement gates, not role names

    private static final String PROFILE = "/api/auth/customer-profile/5";

    @Test
    void customerProfileAndRegisterByStaffNeedTheActAsCustomerEntitlementWhateverTheRoleIsCalled() throws Exception {
        when(users.findById(5L)).thenReturn(Optional.empty());
        // A role called BANKER but without the entitlement is refused ...
        mvc.perform(get(PROFILE).header("Authorization", tokenFor("BANKER", "case.addNote"))).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/register-by-staff").header("Authorization", tokenFor("BANKER", "case.addNote"))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        // ... and a role with another name that holds it is let in (404 = it reached the controller and found no such customer).
        mvc.perform(get(PROFILE).header("Authorization", tokenFor("BRANCH_OFFICER", "case.actAsCustomer"))).andExpect(status().isNotFound());
        // anonymous and customers never
        mvc.perform(get(PROFILE)).andExpect(status().isUnauthorized());
        mvc.perform(get(PROFILE).header("Authorization", tokenFor("CUSTOMER"))).andExpect(status().isForbidden());
    }

    @Test
    void adminEndpointsStillNeedTheAdminRole() throws Exception {
        mvc.perform(get("/api/auth/admin/users")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/admin/users").header("Authorization", tokenFor("BANKER", "case.actAsCustomer"))).andExpect(status().isForbidden());
        when(users.findAll()).thenReturn(List.of());
        mvc.perform(get("/api/auth/admin/users").header("Authorization", tokenFor("ADMIN"))).andExpect(status().isOk());
    }

    // ---- validation added on the admin and language endpoints

    @Test
    void enablingNeedsARealBooleanInsteadOfReadingAMissingOneAsFalse() throws Exception {
        String admin = tokenFor("ADMIN");
        for (String bad : List.of("{}", "{\"enabled\":\"false\"}", "{\"enabled\":null}")) {
            JsonNode b = json.readTree(mvc.perform(put("/api/auth/admin/users/3/enabled").header("Authorization", admin)
                    .contentType(MediaType.APPLICATION_JSON).content(bad)).andExpect(status().isBadRequest())
                    .andReturn().getResponse().getContentAsString());
            assertThat(b.get("success").asBoolean()).isFalse();
        }
        verify(users, never()).save(any());
    }

    @Test
    void creatingStaffValidatesEmailNameNationalIdAndRole() throws Exception {
        String admin = tokenFor("ADMIN");
        for (String bad : List.of(
                "{\"email\":\"nope\",\"fullName\":\"A\",\"nationalId\":\"123456789\",\"role\":\"BANKER\"}",
                "{\"email\":\"a@b.co\",\"fullName\":\"\",\"nationalId\":\"123456789\",\"role\":\"BANKER\"}",
                "{\"email\":\"a@b.co\",\"fullName\":\"A\",\"nationalId\":\"12345\",\"role\":\"BANKER\"}",
                "{\"email\":\"a@b.co\",\"fullName\":\"A\",\"role\":\"BANKER\"}",
                "{\"email\":\"a@b.co\",\"fullName\":\"A\",\"nationalId\":\"123456789\"}")) {
            mvc.perform(post("/api/auth/admin/users").header("Authorization", admin)
                    .contentType(MediaType.APPLICATION_JSON).content(bad)).andExpect(status().isBadRequest());
        }
        verify(users, never()).save(any());
    }

    @Test
    void theLanguageIsStoredForTheSignedInPersonAndMustBeEnOrHe() throws Exception {
        String bearer = tokenFor("CUSTOMER");
        JsonNode ok = json.readTree(mvc.perform(put("/api/auth/language").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"preferredLanguage\":\"he\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(ok.get("message").asString()).isEqualTo("Language preference updated.");
        assertThat(ok.get("data").get("preferredLanguage").asString()).isEqualTo("he");
        verify(users).save(argThat(u -> "he".equals(u.getPreferredLanguage())));

        mvc.perform(put("/api/auth/language").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"preferredLanguage\":\"fr\"}")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/auth/language").contentType(MediaType.APPLICATION_JSON).content("{\"preferredLanguage\":\"en\"}"))
                .andExpect(status().isUnauthorized());
    }
}
