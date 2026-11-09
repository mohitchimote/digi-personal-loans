package com.digibank.document.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AuthenticatedUserTest {

    private static Claims claims(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        Claims c = Jwts.claims(m);
        c.setSubject("uuid-1");
        return c;
    }

    @Test
    void aStaffTokenBecomesAStaffPrincipalWithItsEntitlements() {
        AuthenticatedUser u = AuthenticatedUser.fromClaims(claims(
                "role", "UNDERWRITER", "userId", 14, "roleLabel", "Underwriter",
                "entitlements", List.of("case.approve", "queue.pipeline")));
        assertThat(u.uuid()).isEqualTo("uuid-1");
        assertThat(u.userId()).isEqualTo(14L);   // an Integer in the token, a Long here
        assertThat(u.role()).isEqualTo("UNDERWRITER");
        assertThat(u.roleLabel()).isEqualTo("Underwriter");
        assertThat(u.isStaff()).isTrue();
        assertThat(u.has("case.approve")).isTrue();
        assertThat(u.has("case.decline")).isFalse();
    }

    @Test
    void authoritiesAreTheRolePlusOnePermissionPerEntitlement() {
        AuthenticatedUser u = AuthenticatedUser.fromClaims(claims(
                "role", "BANKER", "userId", 3, "roleLabel", "Banker", "entitlements", List.of("case.addNote")));
        assertThat(u.authorities()).extracting(Object::toString).containsExactlyInAnyOrder("ROLE_BANKER", "PERM_case.addNote");
    }

    @Test
    void aCustomerIsNotStaffAndHoldsNothing() {
        AuthenticatedUser u = AuthenticatedUser.fromClaims(claims("role", "CUSTOMER", "userId", 8));
        assertThat(u.isStaff()).isFalse();
        assertThat(u.entitlements()).isEmpty();
        assertThat(u.authorities()).extracting(Object::toString).containsExactly("ROLE_CUSTOMER");
    }

    @Test
    void anOldStyleTokenWithARoleButNoLabelIsNotStaff() {
        // Issued before roles travelled in the token: a role name alone no longer makes someone staff.
        assertThat(AuthenticatedUser.fromClaims(claims("role", "UNDERWRITER", "userId", 14)).isStaff()).isFalse();
    }

    @Test
    void aTokenWithNoRoleIsNoPrincipal() {
        assertThat(AuthenticatedUser.fromClaims(claims("userId", 1))).isNull();
    }
}
