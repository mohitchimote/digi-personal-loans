package com.digibank.workflow.client;

import com.digibank.workflow.engine.Model.LadderRole;

import java.util.Collection;
import java.util.List;

/**
 * What workflow-service needs to know about other services' data, behind small interfaces so the
 * engine and the services never see HTTP, and tests substitute fakes. The HTTP implementations are in
 * this package ({@link HttpDirectory}); the contracts they assume are written in README.md.
 */
public final class Directory {
    private Directory() {}

    /** A unit of the organisation tree (auth-service GET /api/auth/internal/org/units). */
    public record OrgUnit(long id, Long parentId, Long levelId, String name, String code, boolean active) {}

    /**
     * A staff member (auth-service GET /api/auth/internal/staff). scope (ALL, UNIT_TREE, UNIT_ONLY) and
     * entitlements are optional extras: when present they let eligibility honour the person's own role scope
     * and the "roles holding queue.pipeline" fallback; when absent every listed person counts as able to see
     * the case and to hold the entitlement.
     */
    public record StaffMember(long userId, String uuid, String fullName, String role, Long orgUnitId, boolean available,
                              String scope, List<String> entitlements) {}

    public interface Mandates {
        /** The approval limit for a role in the case's org unit and application type; null = no mandate row, no authority. */
        Double limit(String role, Long orgUnitId, String applicationType);
    }

    public interface Ladder {
        /** Roles with an escalation rank, any order. */
        List<LadderRole> ladder();
    }

    public interface Org {
        List<OrgUnit> units();
    }

    public interface Staff {
        /** Enabled staff, optionally filtered to roles and org units (null or empty filter = no filter). */
        List<StaffMember> staff(Collection<String> roles, Collection<Long> orgUnitIds);
    }

    /** Thrown when another service cannot be reached: the caller gets a 503, never a guess. */
    public static class UpstreamUnavailableException extends RuntimeException {
        public UpstreamUnavailableException(String message, Throwable cause) { super(message, cause); }
    }
}
