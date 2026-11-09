package com.digibank.auth.access;

import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds the default staff roles the first time the roles table is empty. After that the admin owns
 * them, so nothing here ever overwrites, restores or re-adds a role someone changed or deleted.
 */
@Component
@Order(1)
public class AccessSeeder implements CommandLineRunner {

    private final RoleRepository roles;
    private final RoleEntitlementRepository entitlements;

    public AccessSeeder(RoleRepository roles, RoleEntitlementRepository entitlements) {
        this.roles = roles;
        this.entitlements = entitlements;
    }

    @Override
    @Transactional
    public void run(String... args) {
        seed();
    }

    /** Returns how many roles were created (0 when the table already had rows). */
    int seed() {
        if (roles.count() > 0) return 0;
        for (DefaultRole d : DefaultRoles.ALL) {
            Role role = new Role();
            role.setCode(d.code());
            role.setLabel(d.label());
            role.setScope(d.scope().name());
            role.setSystem(true);
            role.setLocked(d.locked());
            role.setEscalationRank(d.rank());
            roles.save(role);
            for (String e : d.entitlements()) entitlements.save(new RoleEntitlement(d.code(), e));
        }
        return DefaultRoles.ALL.size();
    }
}
