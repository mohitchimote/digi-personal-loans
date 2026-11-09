package com.digibank.auth.access;

import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Staff roles are data (the roles and role_entitlements tables, edited in the admin Roles page), not a
 * code constant. This resolves a role code to what it may do. Results are cached briefly, and the
 * admin write paths call {@link #invalidate()}, so an edit is seen by the next token issued.
 */
@Service
public class RoleConfigService {

    static final long TTL_MILLIS = 30_000;

    private final RoleRepository roles;
    private final RoleEntitlementRepository entitlements;

    private volatile Map<String, RoleConfig> cache;
    private volatile long loadedAt;

    public RoleConfigService(RoleRepository roles, RoleEntitlementRepository entitlements) {
        this.roles = roles;
        this.entitlements = entitlements;
    }

    public void invalidate() {
        cache = null;
    }

    private Map<String, RoleConfig> loadAll() {
        Map<String, RoleConfig> current = cache;
        if (current != null && System.currentTimeMillis() - loadedAt < TTL_MILLIS) return current;
        Map<String, Set<String>> held = entitlements.findAll().stream().collect(
                Collectors.groupingBy(RoleEntitlement::getRoleCode,
                        Collectors.mapping(RoleEntitlement::getEntitlement, Collectors.toSet())));
        Map<String, RoleConfig> map = new HashMap<>();
        for (Role r : roles.findAll()) {
            // A locked super-role always holds everything, whatever the table says.
            Set<String> ents = r.isLocked() ? EntitlementCatalog.KEYS : Set.copyOf(held.getOrDefault(r.getCode(), Set.of()));
            map.put(r.getCode(), new RoleConfig(r.getCode(), r.getLabel(), true, Scope.valueOf(r.getScope()), r.getEscalationRank(), ents));
        }
        cache = map;
        loadedAt = System.currentTimeMillis();
        return map;
    }

    /** Resolved config for a role code. Unknown codes (customers, or a deleted role) hold nothing. */
    public RoleConfig resolve(String code) {
        RoleConfig c = loadAll().get(code);
        return c != null ? c : RoleConfig.notStaff(code);
    }

    /** Every staff role (for the escalation ladder). */
    public List<RoleConfig> allStaffRoles() {
        return List.copyOf(loadAll().values());
    }
}
