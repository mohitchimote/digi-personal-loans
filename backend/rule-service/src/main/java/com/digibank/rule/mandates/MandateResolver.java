package com.digibank.rule.mandates;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Which mandate applies to a role on a particular case: a port of the Worker's resolveMandate
 * (lib/mandates.ts). The most specific row wins: the nearest org unit first (the case's own unit, then each
 * ancestor), then a row naming the application type over one that does not. The role default (no unit, no type)
 * is the fallback. No row at all means no approval authority.
 */
public final class MandateResolver {

    private MandateResolver() {}

    /** The row that applied; the limit is null (not 0) when there was none, so "no authority" is explicit. */
    public record Resolved(Double limit, Long orgUnitId, String applicationType) {
        static final Resolved NONE = new Resolved(null, null, null);
    }

    /** The unit itself, then each ancestor, nearest first. A unit missing from the tree still counts as itself. */
    public static List<Long> ancestorChain(Map<Long, Long> parentOf, Long unitId) {
        List<Long> chain = new ArrayList<>();
        if (unitId == null) return chain;
        Long cur = unitId;
        while (cur != null && !chain.contains(cur)) {
            chain.add(cur);
            cur = parentOf.get(cur);
        }
        return chain;
    }

    /** @param roleRows the mandates of the one role being resolved */
    public static Resolved resolve(List<Mandate> roleRows, List<Long> chain, String applicationType) {
        record Candidate(Mandate m, int unitDist, boolean typeMatch) {}
        Optional<Candidate> best = roleRows.stream()
                .filter(m -> (m.getOrgUnitId() == null || chain.contains(m.getOrgUnitId()))
                        && (m.getApplicationType() == null || m.getApplicationType().equals(applicationType)))
                .map(m -> new Candidate(m, m.getOrgUnitId() == null ? Integer.MAX_VALUE : chain.indexOf(m.getOrgUnitId()),
                        m.getApplicationType() != null))
                .min(Comparator.comparingInt(Candidate::unitDist).thenComparing(c -> !c.typeMatch()));
        return best.map(c -> new Resolved(c.m().getMaxAmount(), c.m().getOrgUnitId(), c.m().getApplicationType()))
                .orElse(Resolved.NONE);
    }
}
