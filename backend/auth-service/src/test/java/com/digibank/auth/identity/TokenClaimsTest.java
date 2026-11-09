package com.digibank.auth.identity;

import com.digibank.auth.access.EntitlementCatalog;
import com.digibank.auth.access.RoleConfig;
import com.digibank.auth.access.Scope;
import com.digibank.auth.model.User;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class TokenClaimsTest {

    private static User user(String role, Long orgUnitId) {
        User u = User.builder().email("p@example.com").nationalId("000000111").fullName("Pat").role(role).build();
        u.setOrgUnitId(orgUnitId);
        return u;
    }

    @Test
    void aStaffTokenCarriesWhatTheRoleMayDoAndSee() {
        RoleConfig uw = new RoleConfig("UNDERWRITER", "Underwriter", true, Scope.UNIT_TREE, 1, Set.of("case.decline", "case.approve", "queue.pipeline"));
        Map<String, Object> c = TokenClaims.forUser(user("UNDERWRITER", 7L), uw);
        assertThat(c).containsEntry("role", "UNDERWRITER").containsEntry("fullName", "Pat").containsEntry("email", "p@example.com");
        assertThat(c).containsEntry("roleLabel", "Underwriter").containsEntry("scope", "UNIT_TREE")
                .containsEntry("rank", 1).containsEntry("orgUnitId", 7L);
        // catalog order, whatever order the set iterates in
        assertThat(c.get("entitlements")).isEqualTo(java.util.List.of("queue.pipeline", "case.approve", "case.decline"));
    }

    @Test
    void rankAndOrgUnitAreLeftOutWhenTheyAreNotSet() {
        RoleConfig banker = new RoleConfig("BANKER", "Banker", true, Scope.UNIT_ONLY, null, Set.of("case.addNote"));
        Map<String, Object> c = TokenClaims.forUser(user("BANKER", null), banker);
        assertThat(c).doesNotContainKeys("rank", "orgUnitId");
        assertThat(c).containsEntry("scope", "UNIT_ONLY");
    }

    @Test
    void aCustomerTokenCarriesIdentityOnly() {
        Map<String, Object> c = TokenClaims.forUser(user("CUSTOMER", null), RoleConfig.notStaff("CUSTOMER"));
        assertThat(c.keySet()).containsExactlyInAnyOrder("role", "userId", "fullName", "email");
    }

    @Test
    void aMissingFullNameDoesNotStopATokenBeingIssued() {
        User u = User.builder().email("n@example.com").nationalId("000000112").role("CUSTOMER").build();
        Map<String, Object> c = TokenClaims.forUser(u, RoleConfig.notStaff("CUSTOMER"));
        assertThat(c).containsKey("fullName");
        assertThat(c.get("fullName")).isNull();
    }

    @Test
    void theLockedAdminRoleCarriesEverything() {
        RoleConfig admin = new RoleConfig("ADMIN", "Admin", true, Scope.ALL, null, EntitlementCatalog.KEYS);
        assertThat(TokenClaims.inCatalogOrder(admin)).hasSize(EntitlementCatalog.ALL.size());
    }
}
