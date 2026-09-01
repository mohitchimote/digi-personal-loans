package com.digibank.application.security;

/**
 * The JWT's claims, unpacked into the Authentication's principal — lets controllers read who's
 * actually making a request (role, fullName) without re-parsing "ROLE_X" authorities or trusting
 * a client-supplied "reviewedBy"/"editedBy" field, which is exactly what let a valid-but-junior
 * token forge a senior reviewer's name in the audit trail before this (PRODUCTION_READINESS.md §5).
 */
public record AuthenticatedUser(String uuid, Long userId, String role, String fullName) {

    /** Falls back to the role when fullName is missing, mirroring the frontend's own
     * `auth.userFullName || 'Underwriter'` fallback so the audit trail's format doesn't change. */
    public String displayName() {
        return (fullName != null && !fullName.isBlank()) ? fullName : role;
    }
}
