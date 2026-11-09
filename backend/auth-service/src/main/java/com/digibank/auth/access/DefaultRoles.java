package com.digibank.auth.access;

import java.util.ArrayList;
import java.util.List;

/**
 * The staff roles a fresh installation starts with, and what each may do. Mirrors the Worker's
 * seed (migrations 0012, 0013 and 0015); DefaultRolesParityTest checks that against the SQL, so the
 * two stacks start from the same roles. After first start the admin owns them: they are rows, edited
 * in the Roles page, and are never re-seeded over the admin's changes.
 */
public final class DefaultRoles {

    private DefaultRoles() {}

    private static final List<String> BANKER = List.of(
            "portal.banker", "queue.banker", "dashboard.view", "case.addNote", "case.actAsCustomer", "mandates.view");

    private static final List<String> UNDERWRITER = List.of(
            "portal.underwriter", "queue.pipeline", "dashboard.view", "case.addNote", "case.editSection",
            "case.approve", "case.decline", "case.sendBack", "case.refer", "case.disburse",
            "case.disburseSecondCheck", "case.resolveVerification", "mandates.view");

    /** Senior roles hold everything an underwriter does, and may also assign and reassign cases. */
    private static List<String> senior() {
        List<String> l = new ArrayList<>(UNDERWRITER);
        l.add("case.assign");
        return List.copyOf(l);
    }

    public static final List<DefaultRole> ALL = List.of(
            new DefaultRole("BANKER", "Banker", Scope.UNIT_TREE, null, false, BANKER),
            new DefaultRole("UNDERWRITER", "Underwriter", Scope.ALL, 1, false, UNDERWRITER),
            new DefaultRole("SENIOR_UNDERWRITER", "Senior Underwriter", Scope.ALL, 2, false, senior()),
            new DefaultRole("HEAD_OF_LENDING", "Head of Lending", Scope.ALL, 3, false, senior()),
            new DefaultRole("COO", "COO", Scope.ALL, 4, false, senior()),
            new DefaultRole("CEO", "CEO", Scope.ALL, 5, false, senior()),
            // Locked: always holds every entitlement and cannot be edited or deleted, so nobody can
            // lock themselves out of configuration. Its rows are not stored.
            new DefaultRole("ADMIN", "Admin", Scope.ALL, null, true, List.of()));
}
