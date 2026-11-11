package com.digibank.workflow.engine;

import java.util.List;
import java.util.Map;

/**
 * Which workflow actions get an audit-trail row named after their event (port of audit-policy.ts).
 * Every action that moves a case, and every staff action, is audited. Two kinds are not: a customer's
 * in-place action that changes no status (wizard autosaves would flood the table) and a note-only action
 * that changes no status (the note's own audit entry already records it).
 */
public final class AuditPolicy {
    private AuditPolicy() {}

    public static boolean auditsEvent(String fromStatus, String toStatus, List<String> hostEffectTypes, String actorType) {
        if (!fromStatus.equals(toStatus)) return true;
        if ("CUSTOMER".equals(actorType)) return false;
        return !hostEffectTypes.contains("NOTE");
    }

    /** Convenience over a successful engine result. */
    public static boolean auditsEvent(Map<String, Object> result) {
        Map<String, Object> from = Js.map(result.get("from"));
        Map<String, Object> to = Js.map(result.get("to"));
        List<String> types = Js.listOrEmpty(result.get("hostEffects")).stream().map(e -> (String) Js.map(e).get("type")).toList();
        return auditsEvent((String) from.get("status"), (String) to.get("status"), types, (String) Js.map(result.get("log")).get("actorType"));
    }
}
