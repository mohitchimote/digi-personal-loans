package com.digibank.document.security;

/**
 * The JWT's claims, unpacked into the Authentication's principal — mirrors
 * application-service's AuthenticatedUser. Lets controllers check document ownership
 * (userId vs. a GeneratedDocument/UploadedDocument's customerId) instead of trusting
 * a client-supplied ID (S1, ARCHITECTURE_REVIEW_GAPS.md).
 */
public record AuthenticatedUser(String uuid, Long userId, String role) {
}
