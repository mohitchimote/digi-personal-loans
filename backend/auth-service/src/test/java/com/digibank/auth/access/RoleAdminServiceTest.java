package com.digibank.auth.access;

import com.digibank.auth.compliance.ComplianceAuditWriter;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

/** The roles and entitlements rules, with the Worker's messages (routes/admin-roles.ts). */
@AccessDbTest
class RoleAdminServiceTest {

    @Autowired RoleRepository roles;
    @Autowired RoleEntitlementRepository entitlements;
    @Autowired UserRepository users;
    @Autowired EntityManager em;

    ComplianceAuditWriter audit;
    RoleConfigService config;
    RoleAdminService service;
    static final AdminActor ADMIN = new AdminActor("admin-uuid", "ADMIN");

    @BeforeEach
    void setUp() {
        audit = mock(ComplianceAuditWriter.class);
        config = new RoleConfigService(roles, entitlements);
        service = new RoleAdminService(roles, entitlements, users, config, audit);
        new AccessSeeder(roles, entitlements).seed();
    }

    private RoleCreateRequest create(String code, Integer rank, String... ents) {
        return new RoleCreateRequest(code, "Role " + code, null, "UNIT_ONLY", rank, List.of(ents));
    }

    private void assertRefused(Runnable r, String message, int status) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(AdminApiException.class, e -> {
            assertThat(e.getMessage()).isEqualTo(message);
            assertThat(e.getStatus()).isEqualTo(status);
        });
    }

    private User staffUser(String email, String nid, String role) {
        return users.saveAndFlush(User.builder().email(email).nationalId(nid).fullName(email).role(role).build());
    }

    // ---- list

    @Test
    void listsTheCatalogTheScopesAndEveryRoleWithItsHolders() {
        staffUser("a@example.com", "000000041", "UNDERWRITER");
        staffUser("b@example.com", "000000042", "UNDERWRITER");
        RoleList list = service.list();
        assertThat(list.catalog()).hasSize(EntitlementCatalog.ALL.size());
        assertThat(list.scopes()).containsExactly("ALL", "UNIT_TREE", "UNIT_ONLY");
        RoleView uw = list.roles().stream().filter(r -> r.code().equals("UNDERWRITER")).findFirst().orElseThrow();
        assertThat(uw.userCount()).isEqualTo(2);
        assertThat(uw.entitlements()).contains("case.approve").doesNotContain("case.assign");
        assertThat(uw.isSystem()).isTrue();
        RoleView admin = list.roles().stream().filter(r -> r.code().equals("ADMIN")).findFirst().orElseThrow();
        assertThat(admin.locked()).isTrue();
        assertThat(admin.entitlements()).containsExactlyElementsOf(EntitlementCatalog.ALL.stream().map(EntitlementDef::key).toList());
    }

    // ---- create

    @Test
    void createsARoleAndAuditsIt() {
        String code = service.create(create("BRANCH_OFFICER", 6, "case.addNote", "dashboard.view", "case.addNote"), ADMIN);
        assertThat(code).isEqualTo("BRANCH_OFFICER");
        Role saved = roles.findById("BRANCH_OFFICER").orElseThrow();
        assertThat(saved.isSystem()).isFalse();
        assertThat(saved.isLocked()).isFalse();
        assertThat(saved.getEscalationRank()).isEqualTo(6);
        assertThat(entitlements.findByRoleCode("BRANCH_OFFICER")).extracting(RoleEntitlement::getEntitlement)
                .containsExactlyInAnyOrder("case.addNote", "dashboard.view"); // the repeat is stored once
        verify(audit).record("ROLE_CREATED", "Role", "BRANCH_OFFICER", "admin-uuid", "ADMIN",
                "Role BRANCH_OFFICER; scope=UNIT_ONLY; 3 entitlements");
        assertThat(config.resolve("BRANCH_OFFICER").isStaff()).isTrue(); // cache was invalidated
    }

    @Test
    void refusesReservedDuplicateUnknownEntitlementBadScopeAndTakenRank() {
        assertRefused(() -> service.create(create("CUSTOMER", null), ADMIN), "That code is reserved.", 400);
        assertRefused(() -> service.create(create("UNDERWRITER", null), ADMIN), "A role with that code already exists.", 400);
        assertRefused(() -> service.create(create("X1", null, "case.nonsense", "case.addNote", "nope.key"), ADMIN),
                "Unknown entitlement(s): case.nonsense, nope.key", 400);
        assertRefused(() -> service.create(new RoleCreateRequest("X2", "X", null, "EVERYWHERE", null, List.of()), ADMIN),
                "scope must be one of ALL, UNIT_TREE, UNIT_ONLY.", 400);
        assertRefused(() -> service.create(create("X3", 1), ADMIN), "Ladder position 1 is already used by Underwriter.", 400);
        assertThat(roles.existsById("X1")).isFalse();
    }

    // ---- update

    @Test
    void updatesOnlyTheDifferenceAndAuditsItWithTheWorkersWording() {
        service.create(create("AUDITOR", null, "case.addNote", "dashboard.view"), ADMIN);
        service.update("AUDITOR", new RoleRequest("Auditor", "reads", "UNIT_TREE", 7, List.of("dashboard.view", "queue.pipeline")), ADMIN);
        assertThat(entitlements.findByRoleCode("AUDITOR")).extracting(RoleEntitlement::getEntitlement)
                .containsExactlyInAnyOrder("dashboard.view", "queue.pipeline");
        Role r = roles.findById("AUDITOR").orElseThrow();
        assertThat(r.getScope()).isEqualTo("UNIT_TREE");
        assertThat(r.getEscalationRank()).isEqualTo(7);
        assertThat(r.getDescription()).isEqualTo("reads");
        verify(audit).record("ROLE_UPDATED", "Role", "AUDITOR", "admin-uuid", "ADMIN",
                "scope UNIT_ONLY->UNIT_TREE; rank none->7; +[queue.pipeline] -[case.addNote]");
    }

    @Test
    void revokesTheSessionsOfEveryoneHoldingTheRoleOnlyWhenWhatItAllowsChanges() {
        service.create(create("AUDITOR", null, "case.addNote"), ADMIN);
        User holder = staffUser("h@example.com", "000000051", "AUDITOR");
        User other = staffUser("o@example.com", "000000052", "UNDERWRITER");

        // a label-only edit changes nothing the token carries: nobody is signed out
        service.update("AUDITOR", new RoleRequest("Auditor (renamed)", null, "UNIT_ONLY", null, List.of("case.addNote")), ADMIN);
        em.flush();
        em.clear();
        assertThat(users.findById(holder.getId()).orElseThrow().getSessionsRevokedAt()).isNull();

        // a change to the entitlements revokes the holders' sessions, and only theirs
        service.update("AUDITOR", new RoleRequest("Auditor", null, "UNIT_ONLY", null, List.of("case.addNote", "dashboard.view")), ADMIN);
        em.flush();
        em.clear();
        assertThat(users.findById(holder.getId()).orElseThrow().getSessionsRevokedAt()).isNotNull();
        assertThat(users.findById(other.getId()).orElseThrow().getSessionsRevokedAt()).isNull();
    }

    @Test
    void aRankClashIsRefusedExceptWithTheRoleItself() {
        service.update("UNDERWRITER", new RoleRequest("Underwriter", null, "ALL", 1, List.of("case.approve")), ADMIN); // own rank: fine
        assertRefused(() -> service.update("BANKER", new RoleRequest("Banker", null, "UNIT_TREE", 2, List.of()), ADMIN),
                "Ladder position 2 is already used by Senior Underwriter.", 400);
    }

    @Test
    void theLockedAdminRoleCannotBeEditedAndAMissingOneIsA404() {
        assertRefused(() -> service.update("ADMIN", new RoleRequest("Admin", null, "ALL", null, List.of()), ADMIN),
                "The ADMIN role is locked and cannot be edited.", 403);
        assertRefused(() -> service.update("NOPE", new RoleRequest("N", null, "ALL", null, List.of()), ADMIN), "Role not found.", 404);
    }

    // ---- delete

    @Test
    void deletesACustomRoleWithItsEntitlements() {
        service.create(create("TEMP", null, "case.addNote"), ADMIN);
        service.delete("TEMP", ADMIN);
        assertThat(roles.existsById("TEMP")).isFalse();
        assertThat(entitlements.findByRoleCode("TEMP")).isEmpty();
        verify(audit).record("ROLE_DELETED", "Role", "TEMP", "admin-uuid", "ADMIN", null);
    }

    @Test
    void builtInRolesAndRolesStillHeldCannotBeDeleted() {
        assertRefused(() -> service.delete("UNDERWRITER", ADMIN), "Built-in roles cannot be deleted.", 403);
        assertRefused(() -> service.delete("ADMIN", ADMIN), "Built-in roles cannot be deleted.", 403);
        assertRefused(() -> service.delete("NOPE", ADMIN), "Role not found.", 404);
        service.create(create("AUDITOR", null), ADMIN);
        staffUser("x@example.com", "000000061", "AUDITOR");
        staffUser("y@example.com", "000000062", "AUDITOR");
        assertRefused(() -> service.delete("AUDITOR", ADMIN), "2 user(s) still hold this role - reassign them first.", 400);
        assertThat(roles.existsById("AUDITOR")).isTrue();
    }
}
