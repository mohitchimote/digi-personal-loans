package com.digibank.auth.access;

import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The access entities against a real (in-memory) database: that the mappings are valid, the keys
 * behave, and the seeder plus role resolution work together on real repositories. The production
 * database is MySQL, which is not available to tests; H2 catches mapping mistakes, not dialect ones.
 */
@DataJpaTest
@TestPropertySource(properties = {
        "DB_USERNAME=sa", "DB_PASSWORD=", "JWT_SECRET=test-secret-test-secret-test-secret-0123456789",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "eureka.client.enabled=false"
})
class AccessPersistenceTest {

    @Autowired RoleRepository roles;
    @Autowired RoleEntitlementRepository entitlements;
    @Autowired OrgLevelRepository levels;
    @Autowired OrgUnitRepository units;
    @Autowired UserRepository users;

    @Test
    void seederCreatesTheDefaultRolesAndRoleConfigResolvesThem() {
        int created = new AccessSeeder(roles, entitlements).seed();
        assertThat(created).isEqualTo(DefaultRoles.ALL.size());
        assertThat(roles.count()).isEqualTo(7);

        RoleConfigService config = new RoleConfigService(roles, entitlements);
        RoleConfig underwriter = config.resolve("UNDERWRITER");
        assertThat(underwriter.rank()).isEqualTo(1);
        assertThat(underwriter.entitlements()).contains("case.approve", "case.decline").doesNotContain("case.assign");
        assertThat(config.resolve("CEO").entitlements()).contains("case.assign");
        assertThat(config.resolve("BANKER").scope()).isEqualTo(Scope.UNIT_TREE);
        assertThat(config.resolve("ADMIN").entitlements()).containsExactlyInAnyOrderElementsOf(EntitlementCatalog.KEYS);
    }

    @Test
    void seedingTwiceDoesNotDuplicateOrOverwriteWhatTheAdminChanged() {
        AccessSeeder seeder = new AccessSeeder(roles, entitlements);
        seeder.seed();
        Role banker = roles.findById("BANKER").orElseThrow();
        banker.setLabel("Branch banker");
        roles.save(banker);
        entitlements.deleteByRoleCode("BANKER");

        assertThat(seeder.seed()).isZero();
        assertThat(roles.count()).isEqualTo(7);
        assertThat(roles.findById("BANKER").orElseThrow().getLabel()).isEqualTo("Branch banker");
        assertThat(entitlements.findByRoleCode("BANKER")).isEmpty();
    }

    @Test
    void roleEntitlementKeyIsTheRoleAndEntitlementPair() {
        Role r = new Role();
        r.setCode("AUDITOR");
        r.setLabel("Auditor");
        roles.saveAndFlush(r);
        entitlements.saveAndFlush(new RoleEntitlement("AUDITOR", "case.addNote"));
        entitlements.saveAndFlush(new RoleEntitlement("AUDITOR", "case.addNote")); // same pair: still one row
        entitlements.saveAndFlush(new RoleEntitlement("AUDITOR", "dashboard.view"));
        assertThat(entitlements.findByRoleCode("AUDITOR")).extracting(RoleEntitlement::getEntitlement)
                .containsExactlyInAnyOrder("case.addNote", "dashboard.view");
    }

    @Test
    void orgHierarchyStoresLevelsUnitsAndParents() {
        OrgLevel region = new OrgLevel();
        region.setName("Region");
        region.setDepth(2);
        levels.saveAndFlush(region);
        OrgLevel branch = new OrgLevel();
        branch.setName("Branch");
        branch.setDepth(3);
        levels.saveAndFlush(branch);

        OrgUnit north = new OrgUnit();
        north.setCode("R-N");
        north.setName("North");
        north.setLevelId(region.getId());
        units.saveAndFlush(north);
        OrgUnit haifa = new OrgUnit();
        haifa.setCode("B-HFA");
        haifa.setName("Haifa");
        haifa.setLevelId(branch.getId());
        haifa.setParentId(north.getId());
        units.saveAndFlush(haifa);

        assertThat(units.findByParentId(north.getId())).extracting(OrgUnit::getCode).containsExactly("B-HFA");
        assertThat(units.countByLevelId(branch.getId())).isEqualTo(1);
        assertThat(units.findById(haifa.getId()).orElseThrow().isActive()).isTrue();
        assertThat(levels.existsByName("Region")).isTrue();
    }

    @Test
    void unitCodesAndLevelNamesAreUnique() {
        OrgLevel a = new OrgLevel();
        a.setName("Branch");
        a.setDepth(3);
        levels.saveAndFlush(a);
        OrgLevel dup = new OrgLevel();
        dup.setName("Branch");
        dup.setDepth(4);
        assertThatThrownBy(() -> levels.saveAndFlush(dup)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aStaffMemberCanBePlacedInAnOrgUnit() {
        User u = User.builder().email("branch.officer@example.com").nationalId("000000099").fullName("Officer").role("BANKER").build();
        u.setOrgUnitId(42L);
        User saved = users.saveAndFlush(u);
        assertThat(users.findById(saved.getId()).orElseThrow().getOrgUnitId()).isEqualTo(42L);
    }
}
