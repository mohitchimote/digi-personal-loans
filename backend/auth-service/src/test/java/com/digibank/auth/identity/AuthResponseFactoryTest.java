package com.digibank.auth.identity;

import com.digibank.auth.access.*;
import com.digibank.auth.compliance.ComplianceAuditWriter;
import com.digibank.auth.identity.dto.AuthResponse;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import com.digibank.auth.security.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * The token and login response for each kind of person, with the token parsed back from its signed form:
 * what the other services will actually receive.
 */
@AccessDbTest
class AuthResponseFactoryTest {

    @Autowired RoleRepository roles;
    @Autowired RoleEntitlementRepository entitlements;
    @Autowired UserRepository users;

    RoleConfigService config;
    JwtTokenProvider jwt;
    AuthResponseFactory factory;

    @BeforeEach
    void setUp() {
        new AccessSeeder(roles, entitlements).seed();
        config = new RoleConfigService(roles, entitlements);
        jwt = new JwtTokenProvider();
        ReflectionTestUtils.setField(jwt, "jwtSecret", "test-secret-test-secret-test-secret-0123456789");
        ReflectionTestUtils.setField(jwt, "jwtExpiration", 86_400_000L);
        factory = new AuthResponseFactory(jwt, config);
    }

    private User save(String email, String nid, String role, Long orgUnit) {
        User u = User.builder().email(email).nationalId(nid).fullName("Pat " + role).role(role).build();
        u.setOrgUnitId(orgUnit);
        return users.saveAndFlush(u);
    }

    private AuthResponse issue(User u) {
        UserDetails d = org.springframework.security.core.userdetails.User.withUsername(u.getUuid()).password("N/A").authorities("ROLE_" + u.getRole()).build();
        return factory.build(u, d);
    }

    private Claims claims(AuthResponse r) {
        return jwt.extractClaim(r.getToken(), c -> c);
    }

    @Test
    void anUnderwritersTokenAndResponseCarryTheirEntitlementsScopeRankAndUnit() {
        User u = save("uw@example.com", "000000121", "UNDERWRITER", 7L);
        AuthResponse r = issue(u);
        Claims c = claims(r);

        assertThat(c.getSubject()).isEqualTo(u.getUuid());
        assertThat(c.get("role", String.class)).isEqualTo("UNDERWRITER");
        assertThat(c.get("userId", Number.class).longValue()).isEqualTo(u.getId());
        assertThat(c.get("roleLabel", String.class)).isEqualTo("Underwriter");
        assertThat(c.get("scope", String.class)).isEqualTo("ALL");
        assertThat(c.get("rank", Number.class).intValue()).isEqualTo(1);
        assertThat(c.get("orgUnitId", Number.class).longValue()).isEqualTo(7L);
        assertThat(c.get("entitlements", List.class)).contains("case.approve", "queue.pipeline").doesNotContain("case.assign", "portal.banker");

        assertThat(r.getRoleLabel()).isEqualTo("Underwriter");
        assertThat(r.getScope()).isEqualTo("ALL");
        assertThat(r.getEntitlements()).isEqualTo(c.get("entitlements", List.class));
        assertThat(r.getRole()).isEqualTo("UNDERWRITER");
    }

    @Test
    void aBankersScopeIsTheirRolesAndTheyHaveNoRank() {
        AuthResponse r = issue(save("b@example.com", "000000122", "BANKER", null));
        assertThat(r.getScope()).isEqualTo("UNIT_TREE");
        assertThat(claims(r).get("rank")).isNull();
        assertThat(claims(r).get("orgUnitId")).isNull();
        assertThat(r.getEntitlements()).contains("case.actAsCustomer", "queue.banker");
    }

    @Test
    void theAdminTokenCarriesEveryEntitlement() {
        AuthResponse r = issue(save("a@example.com", "000000123", "ADMIN", null));
        assertThat(r.getEntitlements()).containsExactlyElementsOf(EntitlementCatalog.ALL.stream().map(EntitlementDef::key).toList());
    }

    @Test
    void aCustomerHasNoEntitlementsLabelOrClaimsBeyondIdentity() {
        User u = save("c@example.com", "000000124", "CUSTOMER", null);
        AuthResponse r = issue(u);
        assertThat(r.getEntitlements()).isEmpty();
        assertThat(r.getRoleLabel()).isNull();
        assertThat(r.getScope()).isEqualTo("ALL");
        assertThat(claims(r).keySet()).doesNotContain("entitlements", "roleLabel", "scope", "rank", "orgUnitId");
    }

    @Test
    void aBusinessOwnersCompanyDetailsTravelInTheResponse() {
        User u = User.builder().email("biz@example.com").nationalId("000000125").fullName("Owner").role("BUSINESS_OWNER").build();
        u.setCompanyName("Acme Ltd");
        u.setCompanyRegistrationNumber("515123456");
        u.setCompanyIndustry("Retail");
        u.setCompanyFoundedYear(2011);
        AuthResponse r = issue(users.saveAndFlush(u));
        assertThat(r.getCompanyName()).isEqualTo("Acme Ltd");
        assertThat(r.getCompanyRegistrationNumber()).isEqualTo("515123456");
        assertThat(r.getCompanyIndustry()).isEqualTo("Retail");
        assertThat(r.getCompanyFoundedYear()).isEqualTo(2011);
    }

    @Test
    void theResponseCarriesEveryKeyTheWorkersLoginResponseHas() {
        // From the Worker's buildAuthResponse (lib/user-mappers.ts) plus previousLogin (set on login).
        Set<String> worker = new TreeSet<>(List.of("token", "tokenType", "userId", "email", "nationalId", "idIssueDate", "fullName",
                "phoneNumber", "role", "roleLabel", "entitlements", "scope", "expiresIn", "companyName", "companyRegistrationNumber",
                "companyIndustry", "companyFoundedYear", "previousLogin"));
        JsonNode json = new ObjectMapper().valueToTree(issue(save("k@example.com", "000000126", "UNDERWRITER", null)));
        Set<String> java = new TreeSet<>();
        json.propertyNames().forEach(java::add);
        assertThat(java).containsAll(worker);
    }

    @Test
    void aRoleEditIsInTheNextTokenIssued() {
        User u = save("e@example.com", "000000127", "BANKER", null);
        assertThat(issue(u).getEntitlements()).doesNotContain("case.refer");

        RoleAdminService admin = new RoleAdminService(roles, entitlements, users, config, mock(ComplianceAuditWriter.class));
        admin.update("BANKER", new RoleRequest("Banker", null, "UNIT_ONLY", null, List.of("case.addNote", "case.refer")), new AdminActor("a", "ADMIN"));

        AuthResponse after = issue(u);
        assertThat(after.getEntitlements()).containsExactly("case.addNote", "case.refer");
        assertThat(after.getScope()).isEqualTo("UNIT_ONLY");
        assertThat(claims(after).get("entitlements", List.class)).containsExactly("case.addNote", "case.refer");
    }

    @Test
    void aStaffMemberWhoseRoleWasDeletedIsIssuedACustomerShapedToken() {
        User u = save("gone@example.com", "000000128", "GHOST_ROLE", 3L);
        AuthResponse r = issue(u);
        assertThat(r.getEntitlements()).isEmpty();
        assertThat(claims(r).keySet()).doesNotContain("entitlements", "orgUnitId");
    }
}
