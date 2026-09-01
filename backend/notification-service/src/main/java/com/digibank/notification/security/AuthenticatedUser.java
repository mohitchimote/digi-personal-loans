package com.digibank.notification.security;

/**
 * The JWT's claims, unpacked into the Authentication's principal — mirrors
 * application-service's AuthenticatedUser (same pattern, no shared library between services).
 * Needed here so the email-templates admin endpoints know the acting admin's email (for
 * "updatedBy" and for "send test" recipient) instead of trusting a client-supplied field.
 */
public record AuthenticatedUser(String uuid, Long userId, String role, String fullName, String email) {
}
