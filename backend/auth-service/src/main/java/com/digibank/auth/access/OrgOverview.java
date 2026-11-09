package com.digibank.auth.access;

import java.util.List;

/** What GET /api/auth/admin/org returns: every level (shallowest first) and every unit (by name). */
public record OrgOverview(List<OrgLevel> levels, List<OrgUnit> units) {}
