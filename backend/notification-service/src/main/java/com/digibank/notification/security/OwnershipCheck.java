package com.digibank.notification.security;

import org.springframework.security.access.AccessDeniedException;

/**
 * Staff may act on any customer's records; a customer may reach only their own. "Staff" is read from
 * the token (a staff token carries its role's label), not from a hard-coded list of role names, so a
 * role an admin creates is treated as staff here too, as in the Worker.
 */
public final class OwnershipCheck {

    private OwnershipCheck() {}

    public static void assertOwnsCustomer(AuthenticatedUser user, Long customerId) {
        if (user.isStaff()) return;
        if (user.userId() == null || !user.userId().equals(customerId)) {
            throw new AccessDeniedException("Forbidden.");
        }
    }
}
