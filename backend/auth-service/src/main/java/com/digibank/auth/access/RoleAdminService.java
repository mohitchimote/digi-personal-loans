package com.digibank.auth.access;

import com.digibank.auth.compliance.ComplianceAuditWriter;
import com.digibank.auth.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Admin-configured staff roles and their entitlements. ADMIN is a locked super-role: it always holds
 * every entitlement and cannot be edited or deleted, so nobody can lock themselves out of
 * configuration. The rules and their wording are the Worker's (routes/admin-roles.ts).
 */
@Service
public class RoleAdminService {

    static final List<String> CUSTOMER_ROLES = List.of("CUSTOMER", "BUSINESS_OWNER");

    private final RoleRepository roles;
    private final RoleEntitlementRepository entitlements;
    private final UserRepository users;
    private final RoleConfigService config;
    private final ComplianceAuditWriter audit;

    public RoleAdminService(RoleRepository roles, RoleEntitlementRepository entitlements, UserRepository users,
                            RoleConfigService config, ComplianceAuditWriter audit) {
        this.roles = roles;
        this.entitlements = entitlements;
        this.users = users;
        this.config = config;
        this.audit = audit;
    }

    private static final List<String> SCOPES = Arrays.stream(Scope.values()).map(Enum::name).toList();

    private static int catalogOrder(String key) {
        int i = EntitlementCatalog.ALL.stream().map(EntitlementDef::key).toList().indexOf(key);
        return i < 0 ? Integer.MAX_VALUE : i;
    }

    @Transactional(readOnly = true)
    public RoleList list() {
        Map<String, List<String>> held = entitlements.findAll().stream().collect(
                Collectors.groupingBy(RoleEntitlement::getRoleCode,
                        Collectors.mapping(RoleEntitlement::getEntitlement, Collectors.toList())));
        List<RoleView> views = new ArrayList<>();
        for (Role r : roles.findAll()) {
            List<String> ents = r.isLocked()
                    ? EntitlementCatalog.ALL.stream().map(EntitlementDef::key).toList()
                    : held.getOrDefault(r.getCode(), List.of()).stream().sorted(Comparator.comparingInt(RoleAdminService::catalogOrder)).toList();
            views.add(new RoleView(r.getCode(), r.getLabel(), r.getDescription(), r.getScope(), r.isSystem(), r.isLocked(),
                    r.getEscalationRank(), r.getCreatedAt(), ents, users.countByRole(r.getCode())));
        }
        return new RoleList(EntitlementCatalog.ALL, SCOPES, views);
    }

    private static void assertScope(String scope) {
        if (!Scope.isValid(scope)) throw new AdminApiException("scope must be one of " + String.join(", ", SCOPES) + ".");
    }

    private static void assertKnownEntitlements(List<String> keys) {
        List<String> bad = keys.stream().filter(k -> !EntitlementCatalog.isKnown(k)).toList();
        if (!bad.isEmpty()) throw new AdminApiException("Unknown entitlement(s): " + String.join(", ", bad));
    }

    private void assertRankFree(Integer rank, String selfCode) {
        if (rank == null) return;
        roles.findAll().stream()
                .filter(r -> Objects.equals(r.getEscalationRank(), rank) && !r.getCode().equals(selfCode))
                .findFirst()
                .ifPresent(r -> { throw new AdminApiException("Ladder position " + rank + " is already used by " + r.getLabel() + "."); });
    }

    private static String blankToNull(String s) {
        return s == null || s.trim().isEmpty() ? null : s.trim();
    }

    @Transactional
    public String create(RoleCreateRequest req, AdminActor actor) {
        String code = req.code();
        if (CUSTOMER_ROLES.contains(code)) throw new AdminApiException("That code is reserved.");
        if (roles.existsById(code)) throw new AdminApiException("A role with that code already exists.");
        RoleRequest body = req.body();
        assertScope(body.scope());
        assertKnownEntitlements(body.entitlements());
        assertRankFree(body.escalationRank(), null);

        Role role = new Role();
        role.setCode(code);
        role.setLabel(body.label().trim());
        role.setDescription(blankToNull(body.description()));
        role.setScope(body.scope());
        role.setEscalationRank(body.escalationRank());
        role.setSystem(false);
        role.setLocked(false);
        roles.save(role);
        for (String e : new LinkedHashSet<>(body.entitlements())) entitlements.save(new RoleEntitlement(code, e));
        config.invalidate();
        audit.record("ROLE_CREATED", "Role", code, actor.uuid(), actor.role(),
                role.getLabel() + "; scope=" + body.scope() + "; " + body.entitlements().size() + " entitlements");
        return code;
    }

    @Transactional
    public String update(String code, RoleRequest body, AdminActor actor) {
        Role existing = roles.findById(code).orElseThrow(() -> new AdminApiException("Role not found.", 404));
        if (existing.isLocked()) throw new AdminApiException("The ADMIN role is locked and cannot be edited.", 403);
        assertScope(body.scope());
        assertKnownEntitlements(body.entitlements());
        assertRankFree(body.escalationRank(), code);

        String oldScope = existing.getScope();
        Integer oldRank = existing.getEscalationRank();
        Set<String> before = entitlements.findByRoleCode(code).stream().map(RoleEntitlement::getEntitlement).collect(Collectors.toCollection(LinkedHashSet::new));
        Set<String> after = new LinkedHashSet<>(body.entitlements());

        existing.setLabel(body.label().trim());
        existing.setDescription(blankToNull(body.description()));
        existing.setScope(body.scope());
        existing.setEscalationRank(body.escalationRank());
        roles.save(existing);

        // Only the difference is written: deleting and re-inserting the same pair in one unit of work
        // is applied by Hibernate in the wrong order.
        List<String> removed = before.stream().filter(e -> !after.contains(e)).toList();
        List<String> added = after.stream().filter(e -> !before.contains(e)).toList();
        for (String e : removed) entitlements.deleteById(RoleEntitlement.Key.of(code, e));
        for (String e : added) entitlements.save(new RoleEntitlement(code, e));
        config.invalidate();

        // A change to what the role may do or see must reach people already signed in: revoke every
        // session held by that role, so the next request forces a re-login that carries the new set.
        boolean changed = !oldScope.equals(body.scope()) || !Objects.equals(oldRank, body.escalationRank()) || !before.equals(after);
        if (changed) users.revokeSessionsForRole(code, LocalDateTime.now());

        audit.record("ROLE_UPDATED", "Role", code, actor.uuid(), actor.role(),
                "scope " + oldScope + "->" + body.scope() + "; rank " + (oldRank == null ? "none" : oldRank) + "->"
                        + (body.escalationRank() == null ? "none" : body.escalationRank())
                        + "; +[" + String.join(",", added) + "] -[" + String.join(",", removed) + "]");
        return code;
    }

    @Transactional
    public void delete(String code, AdminActor actor) {
        Role existing = roles.findById(code).orElseThrow(() -> new AdminApiException("Role not found.", 404));
        if (existing.isLocked() || existing.isSystem()) throw new AdminApiException("Built-in roles cannot be deleted.", 403);
        long n = users.countByRole(code);
        if (n > 0) throw new AdminApiException(n + " user(s) still hold this role - reassign them first.");
        entitlements.deleteByRoleCode(code);
        roles.deleteById(code);
        config.invalidate();
        audit.record("ROLE_DELETED", "Role", code, actor.uuid(), actor.role(), null);
    }
}
