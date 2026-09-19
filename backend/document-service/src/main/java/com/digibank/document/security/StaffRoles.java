package com.digibank.document.security;

import java.util.Set;

/**
 * Single source for this service's staff-role list (Q2, ARCHITECTURE_REVIEW_GAPS.md) — previously
 * duplicated identically in StorageController and GenerationController.
 */
public final class StaffRoles {

    public static final Set<String> STAFF_ROLES = Set.of(
            "BANKER", "UNDERWRITER", "SENIOR_UNDERWRITER", "HEAD_OF_LENDING", "COO", "CEO", "ADMIN");

    private StaffRoles() {}
}
