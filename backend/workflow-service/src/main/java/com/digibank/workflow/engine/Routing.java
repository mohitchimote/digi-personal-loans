package com.digibank.workflow.engine;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Case ownership routing and SLA clocks: the pure parts (port of assignment.ts's chooseAssignee and
 * slaStatus). Which roles own a stage, how cases are routed into it and how long it may take all live in
 * the definition's stage block; the service layer applies them.
 */
public final class Routing {
    private Routing() {}

    /** A person who could own a case. lastAssignedAt is an ISO instant or null (never assigned). */
    public record Candidate(long userId, String name, String role, boolean available, int load, String lastAssignedAt) {
        public Map<String, Object> toJson() {
            return Js.obj("userId", userId, "name", name, "role", role, "available", available, "load", load, "lastAssignedAt", lastAssignedAt);
        }
    }

    /** Picks who gets the case. Unavailable people are never chosen. Ties fall to whoever was assigned longest
     * ago (never first), then the lowest user id, so the result is deterministic. mode: MANUAL, ROUND_ROBIN or LEAST_LOADED. */
    public static Candidate chooseAssignee(List<Candidate> candidates, String mode) {
        if ("MANUAL".equals(mode)) return null;
        List<Candidate> pool = new ArrayList<>(candidates.stream().filter(Candidate::available).toList());
        if (pool.isEmpty()) return null;
        Comparator<Candidate> byRecency = Comparator
                .comparing((Candidate c) -> c.lastAssignedAt() == null ? "" : c.lastAssignedAt())
                .thenComparingLong(Candidate::userId);
        pool.sort("LEAST_LOADED".equals(mode) ? Comparator.comparingInt(Candidate::load).thenComparing(byRecency) : byRecency);
        return pool.get(0);
    }

    /** state: NONE, GREEN, AMBER or RED. hours, dueAt and percentUsed are null when there is no clock. */
    public record Sla(String state, Double hours, String dueAt, Long percentUsed) {
        public Map<String, Object> toJson() {
            Object h = hours == null ? null : (hours == Math.rint(hours) ? (Object) hours.longValue() : (Object) hours);
            return Js.obj("state", state, "hours", h, "dueAt", dueAt, "percentUsed", percentUsed);
        }
    }

    private static final java.time.format.DateTimeFormatter ISO_MILLIS =
            java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(java.time.ZoneOffset.UTC);

    /** ISO-8601 with milliseconds, the form the Worker writes (JavaScript's toISOString). */
    public static String iso(Instant i) { return ISO_MILLIS.format(i); }

    private static final Sla NO_SLA = new Sla("NONE", null, null, null);

    /** Green until amberAtPercent (default 75) of the stage's allowed hours is used, amber until the full
     * allowance, red after. Calendar hours. A stage with no SLA, a closed case or an unparseable date has no clock. */
    public static Sla slaStatus(Map<String, Object> stage, String enteredAt, Instant now, boolean closed) {
        Map<String, Object> sla = stage == null ? null : Js.map(stage.get("sla"));
        if (closed || sla == null) return NO_SLA;
        Instant entered;
        try { entered = Instant.parse(enteredAt); } catch (Exception e) { return NO_SLA; }
        double hours = ((Number) sla.get("hours")).doubleValue();
        double allowedMs = hours * 3_600_000;
        double percent = (now.toEpochMilli() - entered.toEpochMilli()) / allowedMs * 100;
        double amberAt = sla.get("amberAtPercent") instanceof Number n ? n.doubleValue() : 75;
        String state = percent >= 100 ? "RED" : percent >= amberAt ? "AMBER" : "GREEN";
        return new Sla(state, hours, iso(Instant.ofEpochMilli(entered.toEpochMilli() + (long) allowedMs)), Math.round(percent));
    }
}
