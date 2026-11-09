package com.digibank.notification.security;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OwnershipCheckTest {

    private static AuthenticatedUser customer(long id) {
        return new AuthenticatedUser("u", id, "CUSTOMER", null, null, null, Set.of());
    }

    private static AuthenticatedUser staff(String role) {
        return new AuthenticatedUser("u", 99L, role, "S", "s@example.com", role + " label", Set.of("case.addNote"));
    }

    @Test
    void aCustomerReachesTheirOwnRecords() {
        assertThatCode(() -> OwnershipCheck.assertOwnsCustomer(customer(8), 8L)).doesNotThrowAnyException();
    }

    @Test
    void aCustomerCannotReachAnotherCustomersRecords() {
        assertThatThrownBy(() -> OwnershipCheck.assertOwnsCustomer(customer(8), 9L))
                .isInstanceOf(AccessDeniedException.class).hasMessage("Forbidden.");
    }

    @Test
    void staffReachAnyCustomersRecordsWhateverTheirRoleIsCalled() {
        // BRANCH_OFFICER is in no list: being staff comes from the token carrying a role label.
        for (String role : new String[]{"BANKER", "UNDERWRITER", "ADMIN", "BRANCH_OFFICER"}) {
            assertThatCode(() -> OwnershipCheck.assertOwnsCustomer(staff(role), 12345L)).doesNotThrowAnyException();
        }
    }

    @Test
    void anOldStyleStaffTokenWithNoLabelIsTreatedAsACustomer() {
        // Fail closed: until the person signs in again, their old token reaches only a record matching its own id.
        AuthenticatedUser old = new AuthenticatedUser("u", 99L, "UNDERWRITER", null, null, null, Set.of());
        assertThatThrownBy(() -> OwnershipCheck.assertOwnsCustomer(old, 12345L)).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void aPrincipalWithNoUserIdReachesNothing() {
        AuthenticatedUser nobody = new AuthenticatedUser("u", null, "CUSTOMER", null, null, null, Set.of());
        assertThatThrownBy(() -> OwnershipCheck.assertOwnsCustomer(nobody, 1L)).isInstanceOf(AccessDeniedException.class);
    }
}
