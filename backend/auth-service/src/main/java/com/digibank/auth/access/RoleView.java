package com.digibank.auth.access;

import java.time.Instant;
import java.util.List;

/**
 * A role as the Roles page reads it. A record, so the JSON keys are exactly these names (a Java getter
 * isSystem() would otherwise be published as "system", not the "isSystem" the Worker sends).
 */
public record RoleView(
        String code, String label, String description, String scope, boolean isSystem, boolean locked,
        Integer escalationRank, Instant createdAt, List<String> entitlements, long userCount) {}
