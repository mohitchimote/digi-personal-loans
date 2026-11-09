package com.digibank.auth.access;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class RoleConfigServiceTest {

    private RoleRepository roles;
    private RoleEntitlementRepository ents;
    private RoleConfigService service;

    private static Role role(String code, String label, String scope, boolean locked, Integer rank) {
        Role r = new Role();
        r.setCode(code);
        r.setLabel(label);
        r.setScope(scope);
        r.setLocked(locked);
        r.setEscalationRank(rank);
        return r;
    }

    @BeforeEach
    void setUp() {
        roles = mock(RoleRepository.class);
        ents = mock(RoleEntitlementRepository.class);
        when(roles.findAll()).thenReturn(List.of(
                role("UNDERWRITER", "Underwriter", "ALL", false, 1),
                role("BANKER", "Banker", "UNIT_TREE", false, null),
                role("ADMIN", "Admin", "ALL", true, null)));
        when(ents.findAll()).thenReturn(List.of(
                new RoleEntitlement("UNDERWRITER", "case.approve"),
                new RoleEntitlement("UNDERWRITER", "case.decline"),
                new RoleEntitlement("BANKER", "case.addNote")));
        service = new RoleConfigService(roles, ents);
    }

    @Test
    void resolvesWhatARoleMayDoAndSee() {
        RoleConfig uw = service.resolve("UNDERWRITER");
        assertThat(uw.isStaff()).isTrue();
        assertThat(uw.scope()).isEqualTo(Scope.ALL);
        assertThat(uw.rank()).isEqualTo(1);
        assertThat(uw.entitlements()).containsExactlyInAnyOrder("case.approve", "case.decline");
        assertThat(service.resolve("BANKER").scope()).isEqualTo(Scope.UNIT_TREE);
    }

    @Test
    void aLockedRoleAlwaysHoldsEverythingWhateverTheTableSays() {
        assertThat(service.resolve("ADMIN").entitlements()).containsExactlyInAnyOrderElementsOf(EntitlementCatalog.KEYS);
    }

    @Test
    void unknownCodesAreNotStaffAndHoldNothing() {
        RoleConfig customer = service.resolve("CUSTOMER");
        assertThat(customer.isStaff()).isFalse();
        assertThat(customer.entitlements()).isEmpty();
        assertThat(service.resolve("A_DELETED_ROLE").isStaff()).isFalse();
    }

    @Test
    void cachesUntilInvalidated() {
        service.resolve("UNDERWRITER");
        service.resolve("BANKER");
        verify(roles, times(1)).findAll();
        service.invalidate();
        service.resolve("UNDERWRITER");
        verify(roles, times(2)).findAll();
    }

    @Test
    void listsOnlyStaffRolesForTheLadder() {
        assertThat(service.allStaffRoles()).extracting(RoleConfig::code).containsExactlyInAnyOrder("UNDERWRITER", "BANKER", "ADMIN");
    }
}
