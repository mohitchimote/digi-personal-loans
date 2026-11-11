package com.digibank.rule.directory;

import java.util.List;

/**
 * What this service needs from auth-service: the org hierarchy (to walk a unit's ancestors) and the escalation
 * ladder (to say which roles a mandate may be set for). Both live in auth-service; this is the one place that
 * knows how to ask. Failure is reported, never papered over: see {@link DirectoryUnavailableException}.
 */
public interface AuthDirectory {

    record OrgUnitInfo(Long id, Long parentId) {}

    record LadderRole(String code, String label, Integer rank) {}

    /** Every org unit (only id and parent matter here). */
    List<OrgUnitInfo> orgUnits();

    /** Roles with an escalation rank, ascending by rank. */
    List<LadderRole> ladder();
}
