package com.digibank.workflow.engine;

import java.util.List;
import java.util.Map;
import java.util.Set;

/** Runtime inputs of the engine (workflow-spec/README.md, "Inputs"). */
public final class Model {
    private Model() {}

    /** type is CUSTOMER, STAFF or SYSTEM; rank is the escalation-ladder position or null. */
    public record Actor(String type, long userId, String name, String role, Integer rank, Set<String> entitlements, String scope) {
        public boolean has(String entitlement) { return entitlements != null && entitlements.contains(entitlement); }
    }

    public record LadderRole(String code, String label, int rank) {}

    /** Host-computed facts. mandateLimit null means no mandate row, i.e. no authority. */
    public record Facts(boolean caseVisible, boolean isOwner, Double mandateLimit, List<LadderRole> ladder) {}

    /** tracks: track key to {status, stage}; fields: referredToRole, approvedAmount, guarantorRequired, ... */
    public record CaseState(Map<String, Map<String, Object>> tracks, Map<String, Object> fields) {}

    /** A request to run one action. input may be null. now is an ISO-8601 instant string. */
    public record Request(String action, Actor actor, Map<String, Object> input, String now) {}
}
