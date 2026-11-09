package com.digibank.auth.access;

import java.util.List;

/** What GET /api/auth/admin/roles returns: the catalog to pick from, the scopes, and every role. */
public record RoleList(List<EntitlementDef> catalog, List<String> scopes, List<RoleView> roles) {}
