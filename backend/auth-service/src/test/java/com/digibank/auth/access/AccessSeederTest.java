package com.digibank.auth.access;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class AccessSeederTest {

    @Test
    void seedsTheDefaultRolesIntoAnEmptyTable() {
        RoleRepository roles = mock(RoleRepository.class);
        RoleEntitlementRepository ents = mock(RoleEntitlementRepository.class);
        when(roles.count()).thenReturn(0L);

        int created = new AccessSeeder(roles, ents).seed();

        assertThat(created).isEqualTo(DefaultRoles.ALL.size());
        ArgumentCaptor<Role> saved = ArgumentCaptor.forClass(Role.class);
        verify(roles, times(DefaultRoles.ALL.size())).save(saved.capture());
        assertThat(saved.getAllValues()).extracting(Role::getCode)
                .containsExactlyElementsOf(DefaultRoles.ALL.stream().map(DefaultRole::code).toList());
        assertThat(saved.getAllValues()).allMatch(Role::isSystem);
        int expectedRows = DefaultRoles.ALL.stream().mapToInt(r -> r.entitlements().size()).sum();
        verify(ents, times(expectedRows)).save(any(RoleEntitlement.class));
    }

    @Test
    void neverTouchesRolesTheAdminAlreadyOwns() {
        RoleRepository roles = mock(RoleRepository.class);
        RoleEntitlementRepository ents = mock(RoleEntitlementRepository.class);
        when(roles.count()).thenReturn(3L);

        assertThat(new AccessSeeder(roles, ents).seed()).isZero();
        verify(roles, never()).save(any());
        verify(ents, never()).save(any());
    }
}
