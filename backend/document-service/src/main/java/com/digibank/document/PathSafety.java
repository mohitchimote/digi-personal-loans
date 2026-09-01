package com.digibank.document;

/**
 * Shared by both contexts in this service (generation and storage) — applicationRef is
 * attacker-influenced and used verbatim as a filesystem directory segment in both, so both need
 * the same allowlist check to prevent path traversal (PRODUCTION_READINESS.md §5, finding 3).
 */
public final class PathSafety {

    private PathSafety() {}

    public static String safePathSegment(String value, String fieldName) {
        if (value == null || value.isBlank() || !value.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("Invalid " + fieldName + ".");
        }
        return value;
    }
}
