package com.digibank.application.org;

import com.digibank.application.client.AuthServiceOrgClient;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.security.AuthenticatedUser;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Branch-scoped case visibility, the port of worker/src/lib/org.ts. A staff token carries the role's
 * scope (ALL, UNIT_TREE, UNIT_ONLY) and the person's org unit. A person with no unit stays
 * unrestricted whatever the scope says, and cases with no unit (digital self-service) are visible to
 * every staff member.
 */
@Component
public class OrgScope {

    private final AuthServiceOrgClient orgClient;

    public OrgScope(AuthServiceOrgClient orgClient) {
        this.orgClient = orgClient;
    }

    /** The unit itself plus every descendant, walking parentId links (cycle-safe). */
    static Set<Long> subtree(List<OrgUnitInfo> units, Long rootId) {
        Map<Long, List<Long>> children = new HashMap<>();
        for (OrgUnitInfo u : units) {
            if (u.parentId() != null) children.computeIfAbsent(u.parentId(), k -> new ArrayList<>()).add(u.id());
        }
        Set<Long> out = new LinkedHashSet<>();
        Deque<Long> stack = new ArrayDeque<>(List.of(rootId));
        while (!stack.isEmpty()) {
            Long id = stack.pop();
            if (!out.add(id)) continue;
            stack.addAll(children.getOrDefault(id, List.of()));
        }
        return out;
    }

    /** Org unit ids the user may see cases for, or null when unrestricted. */
    public Set<Long> visibleUnitIds(AuthenticatedUser user) {
        String scope = user.scope();
        if (user.orgUnitId() == null || "ALL".equals(scope) || scope == null) return null;
        if ("UNIT_ONLY".equals(scope)) return Set.of(user.orgUnitId());
        Set<Long> tree = subtree(orgClient.units(), user.orgUnitId());
        return tree; // always contains the user's own unit, even when the directory is unreachable
    }

    public boolean isVisible(AuthenticatedUser user, Long caseOrgUnitId) {
        Set<Long> ids = visibleUnitIds(user);
        return ids == null || caseOrgUnitId == null || ids.contains(caseOrgUnitId);
    }

    public List<LoanApplication> filter(AuthenticatedUser user, List<LoanApplication> cases) {
        Set<Long> ids = visibleUnitIds(user);
        if (ids == null) return cases;
        return cases.stream().filter(a -> a.getOrgUnitId() == null || ids.contains(a.getOrgUnitId())).toList();
    }
}
