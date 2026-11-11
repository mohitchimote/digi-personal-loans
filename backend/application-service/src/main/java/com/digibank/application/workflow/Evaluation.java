package com.digibank.application.workflow;

import java.util.List;
import java.util.Map;

/**
 * workflow-service's answer to an evaluate call. A refusal is HTTP 200 {@code ok:false} with the status the
 * client should be given; a success carries what application-service must do about it: {@code mirror} (the
 * legacy status columns), {@code fieldUpdates} (application fields), {@code referral}, {@code hostEffects} (in
 * order) and {@code audit}. See backend/workflow-service/README.md.
 */
public record Evaluation(boolean ok, int status, String code, String message,
                         String action, String event, String track, Map<String, Object> from, Map<String, Object> to,
                         Map<String, Object> fieldUpdates, boolean referralClose, String referralOpenToRole,
                         List<Map<String, Object>> hostEffects, Map<String, Object> log, Map<String, Object> mirror,
                         Map<String, Object> audit, boolean committed, boolean replayed) {

    public static Evaluation refusal(int status, String code, String message) {
        return new Evaluation(false, status, code, message, null, null, null, Map.of(), Map.of(), Map.of(), false, null,
                List.of(), Map.of(), Map.of(), Map.of(), false, false);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object o) {
        return o instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    @SuppressWarnings("unchecked")
    public static Evaluation fromMap(Map<String, Object> m) {
        if (!Boolean.TRUE.equals(m.get("ok"))) {
            Object status = m.get("status");
            return refusal(status instanceof Number n ? n.intValue() : 400, (String) m.get("code"),
                    m.get("message") == null ? "The action was refused." : String.valueOf(m.get("message")));
        }
        Map<String, Object> referral = map(m.get("referral"));
        Map<String, Object> open = referral.get("open") instanceof Map<?, ?> ? map(referral.get("open")) : null;
        List<Map<String, Object>> effects = m.get("hostEffects") instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
        return new Evaluation(true, 200, null, null, (String) m.get("action"), (String) m.get("event"), (String) m.get("track"),
                map(m.get("from")), map(m.get("to")), map(m.get("fieldUpdates")), Boolean.TRUE.equals(referral.get("close")),
                open == null ? null : (String) open.get("toRole"), effects, map(m.get("log")), map(m.get("mirror")), map(m.get("audit")),
                Boolean.TRUE.equals(m.get("committed")), Boolean.TRUE.equals(m.get("replayed")));
    }
}
