package com.digibank.application.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AuthenticatedUserTest {

    private static Claims claims(Map<String, Object> m) {
        Claims c = Jwts.claims(new HashMap<>(m));
        c.setSubject("uuid-1");
        return c;
    }

    @Test
    void aStaffTokenBecomesAPrincipalWithItsEntitlementsScopeUnitAndRank() {
        AuthenticatedUser u = AuthenticatedUser.fromClaims(claims(Map.of(
                "role", "UNDERWRITER", "userId", 14, "fullName", "Una Writer", "roleLabel", "Underwriter",
                "entitlements", List.of("case.approve", "queue.pipeline"), "scope", "UNIT_TREE", "orgUnitId", 5, "rank", 1)));
        assertThat(u.uuid()).isEqualTo("uuid-1");
        assertThat(u.userId()).isEqualTo(14L);          // an Integer in the token, a Long here
        assertThat(u.orgUnitId()).isEqualTo(5L);
        assertThat(u.rank()).isEqualTo(1);
        assertThat(u.scope()).isEqualTo("UNIT_TREE");
        assertThat(u.isStaff()).isTrue();
        assertThat(u.has("case.approve")).isTrue();
        assertThat(u.has("case.decline")).isFalse();
        assertThat(u.displayName()).isEqualTo("Una Writer");
    }

    @Test
    void authoritiesAreTheRolePlusOnePermissionPerEntitlement() {
        AuthenticatedUser u = AuthenticatedUser.fromClaims(claims(Map.of(
                "role", "BANKER", "userId", 3, "roleLabel", "Banker", "entitlements", List.of("case.addNote", "queue.banker"))));
        assertThat(u.authorities()).extracting(Object::toString)
                .containsExactlyInAnyOrder("ROLE_BANKER", "PERM_case.addNote", "PERM_queue.banker");
    }

    @Test
    void aCustomerTokenHasNoEntitlementsAndIsNotStaff() {
        AuthenticatedUser u = AuthenticatedUser.fromClaims(claims(Map.of("role", "CUSTOMER", "userId", 8, "fullName", "Cora")));
        assertThat(u.entitlements()).isEmpty();
        assertThat(u.isStaff()).isFalse();
        assertThat(u.orgUnitId()).isNull();
        assertThat(u.rank()).isNull();
        assertThat(u.authorities()).extracting(Object::toString).containsExactly("ROLE_CUSTOMER");
    }

    @Test
    void anOldStyleTokenWithARoleButNoEntitlementsHoldsNothing() {
        // Tokens issued before entitlements travelled in the token: a role name alone grants no permission.
        AuthenticatedUser u = AuthenticatedUser.fromClaims(claims(Map.of("role", "UNDERWRITER", "userId", 14)));
        assertThat(u.entitlements()).isEmpty();
        assertThat(u.isStaff()).isFalse();
    }

    @Test
    void aTokenWithNoRoleIsNoPrincipal() {
        assertThat(AuthenticatedUser.fromClaims(claims(Map.of("userId", 1)))).isNull();
    }

    @Test
    void displayNameFallsBackToTheRoleWhenThereIsNoName() {
        assertThat(AuthenticatedUser.fromClaims(claims(Map.of("role", "COO", "userId", 1))).displayName()).isEqualTo("COO");
    }
}
