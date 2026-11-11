package com.digibank.application.workflow;

import com.digibank.application.security.AuthenticatedUser;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Who is acting, in the shape workflow-service's internal evaluate and queues/resolve calls take
 * ({type,userId,name,role,rank,entitlements,scope,orgUnitId}). The same fields the Worker's callerActor
 * builds. For a customer userId is the customer id; for the system (auto-approval) it is 0.
 */
public record WorkflowActor(String type, long userId, String name, String role, Integer rank, Set<String> entitlements,
                            String scope, Long orgUnitId) {

    public static final String CUSTOMER = "CUSTOMER";
    public static final String STAFF = "STAFF";
    public static final String SYSTEM = "SYSTEM";

    /** The Worker's SYSTEM_AUTO_APPROVAL. */
    public static final WorkflowActor SYSTEM_AUTO_APPROVAL =
            new WorkflowActor(SYSTEM, 0, "System (Auto-Approval)", null, null, Set.of(), "ALL", null);

    /** The signed-in caller. Staff tokens carry their role label; everyone else is a customer. Name: full name, else email, else role. */
    public static WorkflowActor of(AuthenticatedUser u) {
        String name = u.fullName() != null && !u.fullName().isBlank() ? u.fullName().trim()
                : u.email() != null && !u.email().isBlank() ? u.email() : u.role();
        return new WorkflowActor(u.isStaff() ? STAFF : CUSTOMER, u.userId() == null ? 0 : u.userId(), name, u.role(), u.rank(),
                u.entitlements(), u.scope() == null ? "ALL" : u.scope(), u.orgUnitId());
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", type);
        m.put("userId", userId);
        m.put("name", name);
        m.put("role", role);
        m.put("rank", rank);
        List<String> ents = new ArrayList<>(entitlements);
        Collections.sort(ents);
        m.put("entitlements", ents);
        m.put("scope", scope);
        m.put("orgUnitId", orgUnitId);
        return m;
    }
}
