package com.digibank.auth.access;

/** One entitlement in the catalog: a stable key plus the text the Roles page shows. */
public record EntitlementDef(String key, String group, String label, String description) {}
