package com.digibank.workflow.service;

import com.digibank.workflow.engine.Js;
import com.digibank.workflow.engine.Model.Actor;
import com.digibank.workflow.security.AuthenticatedUser;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Who is acting: the engine's actor plus the org unit the caller belongs to (for case visibility). */
public record Caller(Actor actor, Long orgUnitId) {

    public boolean isStaff() { return "STAFF".equals(actor.type()); }

    public boolean isSystem() { return "SYSTEM".equals(actor.type()); }

    /** A signed-in caller. Staff tokens carry their role label; everyone else is a customer. */
    public static Caller of(AuthenticatedUser u) {
        String scope = u.scope() == null ? "ALL" : u.scope();
        Actor a = new Actor(u.isStaff() ? "STAFF" : "CUSTOMER", u.userId() == null ? 0 : u.userId(), u.displayName(), u.role(),
                u.rank(), u.entitlements(), scope);
        return new Caller(a, u.orgUnitId());
    }

    /** An actor sent by application-service on an internal call: {type,userId,name,role,rank,entitlements,scope,orgUnitId}. */
    public static Caller fromMap(Map<String, Object> m) {
        if (m == null) throw new WorkflowException("actor is required.", 400);
        String type = (String) m.get("type");
        if (!Set.of("CUSTOMER", "STAFF", "SYSTEM").contains(type)) throw new WorkflowException("actor.type must be CUSTOMER, STAFF or SYSTEM.", 400);
        Set<String> ents = new HashSet<>();
        for (Object e : Js.listOrEmpty(m.get("entitlements"))) ents.add(String.valueOf(e));
        Actor a = new Actor(type, m.get("userId") instanceof Number n ? n.longValue() : 0, m.get("name") == null ? "" : String.valueOf(m.get("name")),
                (String) m.get("role"), m.get("rank") instanceof Number r ? r.intValue() : null, ents,
                m.get("scope") == null ? "ALL" : String.valueOf(m.get("scope")));
        return new Caller(a, m.get("orgUnitId") instanceof Number o ? o.longValue() : null);
    }
}
