package com.digibank.workflow.service;

import com.digibank.workflow.client.Directory;
import com.digibank.workflow.client.Directory.OrgUnit;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Who can see which case, by org scope (port of the Worker's org.ts, expressed from the case's side).
 * A person whose scope is ALL, or who has no org unit, sees everything; UNIT_ONLY sees their own unit;
 * UNIT_TREE sees their unit and everything beneath it. A case with no org unit (digital self-service) is
 * visible to everyone. The org tree is only fetched when a decision needs it.
 */
@Component
public class Visibility {

    private final Directory.Org org;

    public Visibility(Directory.Org org) {
        this.org = org;
    }

    /** The unit itself and each parent above it (cycle-guarded). */
    public List<Long> ancestors(Long unitId) {
        List<Long> out = new ArrayList<>();
        if (unitId == null) return out;
        Map<Long, Long> parent = new HashMap<>();
        for (OrgUnit u : org.units()) parent.put(u.id(), u.parentId());
        for (Long id = unitId; id != null && !out.contains(id); id = parent.get(id)) out.add(id);
        return out;
    }

    public boolean canSee(String scope, Long userUnit, Long caseUnit) {
        if (scope == null || "ALL".equals(scope) || userUnit == null || caseUnit == null) return true;
        if ("UNIT_ONLY".equals(scope)) return userUnit.equals(caseUnit);
        return ancestors(caseUnit).contains(userUnit);
    }
}
