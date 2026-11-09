package com.digibank.auth.access;

import com.digibank.auth.compliance.ComplianceAuditWriter;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

/** The organisation rules, with the Worker's messages (routes/admin-org.ts). */
@AccessDbTest
class OrgAdminServiceTest {

    @Autowired OrgLevelRepository levels;
    @Autowired OrgUnitRepository units;
    @Autowired UserRepository users;

    ComplianceAuditWriter audit;
    long casesInUnit;
    OrgAdminService service;
    static final AdminActor ADMIN = new AdminActor("admin-uuid", "ADMIN");

    @BeforeEach
    void setUp() {
        audit = mock(ComplianceAuditWriter.class);
        casesInUnit = 0;
        service = new OrgAdminService(levels, units, users, id -> casesInUnit, audit);
    }

    private OrgLevel level(String name, int depth) {
        return service.createLevel(new LevelRequest(name, depth), ADMIN);
    }

    private OrgUnit unit(String code, String name, OrgLevel level, OrgUnit parent) {
        return service.createUnit(new UnitRequest(code, name, level.getId(), parent == null ? null : parent.getId(), null), ADMIN);
    }

    private void assertRefused(Runnable r, String message, int status) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(AdminApiException.class, e -> {
            assertThat(e.getMessage()).isEqualTo(message);
            assertThat(e.getStatus()).isEqualTo(status);
        });
    }

    // ---- levels

    @Test
    void createsALevelTrimmedAndAuditsIt() {
        OrgLevel l = level("  Region  ", 2);
        assertThat(l.getName()).isEqualTo("Region");
        assertThat(l.getDepth()).isEqualTo(2);
        verify(audit).record("ORG_LEVEL_CREATED", "OrgLevel", String.valueOf(l.getId()), "admin-uuid", "ADMIN", "Region");
    }

    @Test
    void refusesADuplicateLevelName() {
        level("Region", 2);
        assertRefused(() -> level("Region", 3), "A level with that name already exists.", 400);
    }

    @Test
    void renamesALevelAndRefusesANameAnotherLevelHolds() {
        OrgLevel region = level("Region", 2);
        level("Branch", 3);
        OrgLevel renamed = service.updateLevel(region.getId(), new LevelRequest("Area", 2), ADMIN);
        assertThat(renamed.getName()).isEqualTo("Area");
        verify(audit).record("ORG_LEVEL_UPDATED", "OrgLevel", String.valueOf(region.getId()), "admin-uuid", "ADMIN", "Region -> Area");
        assertRefused(() -> service.updateLevel(region.getId(), new LevelRequest("Branch", 2), ADMIN), "A level with that name already exists.", 400);
        // keeping its own name is fine
        assertThat(service.updateLevel(region.getId(), new LevelRequest("Area", 5), ADMIN).getDepth()).isEqualTo(5);
    }

    @Test
    void updatingAMissingLevelIsA404() {
        assertRefused(() -> service.updateLevel(9999, new LevelRequest("X", 1), ADMIN), "Level not found.", 404);
    }

    @Test
    void aLevelInUseCannotBeDeleted() {
        OrgLevel head = level("Head Office", 1);
        unit("HQ", "Head Office", head, null);
        assertRefused(() -> service.deleteLevel(head.getId(), ADMIN), "Level is in use by org units - move or delete them first.", 400);
        assertThat(levels.existsById(head.getId())).isTrue();
    }

    @Test
    void anUnusedLevelIsDeletedAndDeletingAnUnknownOneIsSilent() {
        OrgLevel l = level("Temp", 9);
        service.deleteLevel(l.getId(), ADMIN);
        assertThat(levels.existsById(l.getId())).isFalse();
        service.deleteLevel(424242, ADMIN); // the Worker answers 204 here too
    }

    // ---- units

    @Test
    void aUnitMustSitUnderAHigherLevelThanItsParent() {
        OrgLevel region = level("Region", 2);
        OrgLevel branch = level("Branch", 3);
        OrgUnit north = unit("R-N", "North", region, null);
        assertThat(unit("B-HFA", "Haifa", branch, north).getParentId()).isEqualTo(north.getId());
        assertRefused(() -> unit("R-X", "Elsewhere", region, north), "A Region must sit under a higher level than Region.", 400);
        OrgLevel same = level("Cluster", 3);
        OrgUnit haifa = units.findAll().stream().filter(u -> u.getCode().equals("B-HFA")).findFirst().orElseThrow();
        assertRefused(() -> unit("B-X", "Odd", same, haifa), "A Cluster must sit under a higher level than Branch.", 400);
    }

    @Test
    void refusesUnknownLevelUnknownParentAndDuplicateCode() {
        OrgLevel region = level("Region", 2);
        OrgUnit north = unit("R-N", "North", region, null);
        assertRefused(() -> service.createUnit(new UnitRequest("Z", "Z", 9999L, null, null), ADMIN), "Unknown level.", 400);
        assertRefused(() -> service.createUnit(new UnitRequest("Z", "Z", region.getId(), 9999L, null), ADMIN), "Unknown parent unit.", 400);
        assertRefused(() -> unit("R-N", "Again", region, null), "A unit with that code already exists.", 400);
        assertThat(north.isActive()).isTrue();
    }

    @Test
    void movingAUnitDownTheTreeIsRefusedByTheDepthRuleAndSubtreeFollowsParentLinks() {
        OrgLevel head = level("Head Office", 1);
        OrgLevel region = level("Region", 2);
        OrgLevel branch = level("Branch", 3);
        OrgUnit hq = unit("HQ", "Head Office", head, null);
        OrgUnit north = unit("R-N", "North", region, hq);
        OrgUnit haifa = unit("B-HFA", "Haifa", branch, north);
        // Head Office placed under Region (one of its own descendants) breaks the depth rule first.
        assertRefused(() -> service.updateUnit(hq.getId(), new UnitRequest("HQ", "Head Office", head.getId(), north.getId(), null), ADMIN),
                "A Head Office must sit under a higher level than Region.", 400);
        assertThat(service.subtreeIds(hq.getId())).containsExactlyInAnyOrder(hq.getId(), north.getId(), haifa.getId());
        assertThat(service.subtreeIds(north.getId())).containsExactlyInAnyOrder(north.getId(), haifa.getId());
    }

    @Test
    void cycleCheckStopsAReparentUnderADescendantOnTheSameDepthRules() {
        // Depths are strictly increasing down the tree, so a cycle is only reachable if levels are
        // edited afterwards. Edit them to make the cycle depth-legal, then prove the cycle rule holds.
        OrgLevel a = level("A", 1);
        OrgLevel b = level("B", 2);
        OrgUnit top = unit("TOP", "Top", a, null);
        OrgUnit child = unit("CH", "Child", b, top);
        service.updateLevel(a.getId(), new LevelRequest("A", 5), ADMIN); // top is now deeper than child
        assertRefused(() -> service.updateUnit(top.getId(), new UnitRequest("TOP", "Top", a.getId(), child.getId(), null), ADMIN),
                "A unit cannot be moved under itself or one of its own descendants.", 400);
    }

    @Test
    void updatingAUnitKeepsActiveWhenNotSentAndAuditsTheBeforeState() {
        OrgLevel region = level("Region", 2);
        OrgUnit north = unit("R-N", "North", region, null);
        service.updateUnit(north.getId(), new UnitRequest("R-N", "North region", region.getId(), null, false), ADMIN);
        OrgUnit again = service.updateUnit(north.getId(), new UnitRequest("R-N", "North region 2", region.getId(), null, null), ADMIN);
        assertThat(again.isActive()).isFalse();
        verify(audit).record("ORG_UNIT_UPDATED", "OrgUnit", String.valueOf(north.getId()), "admin-uuid", "ADMIN", "R-N North");
        assertRefused(() -> service.updateUnit(9999, new UnitRequest("Q", "Q", region.getId(), null, null), ADMIN), "Unit not found.", 404);
    }

    @Test
    void aUnitWithChildrenStaffOrCasesCannotBeDeleted() {
        OrgLevel region = level("Region", 2);
        OrgLevel branch = level("Branch", 3);
        OrgUnit north = unit("R-N", "North", region, null);
        OrgUnit haifa = unit("B-HFA", "Haifa", branch, north);

        assertRefused(() -> service.deleteUnit(north.getId(), ADMIN),
                "Unit still has 1 child unit(s), 0 staff user(s) and 0 case(s) - deactivate it instead of deleting.", 400);

        User officer = User.builder().email("o@example.com").nationalId("000000031").fullName("O").role("BANKER").build();
        officer.setOrgUnitId(haifa.getId());
        users.saveAndFlush(officer);
        casesInUnit = 2;
        assertRefused(() -> service.deleteUnit(haifa.getId(), ADMIN),
                "Unit still has 0 child unit(s), 1 staff user(s) and 2 case(s) - deactivate it instead of deleting.", 400);
    }

    @Test
    void anEmptyUnitIsDeletedAndAudited() {
        OrgLevel region = level("Region", 2);
        OrgUnit north = unit("R-N", "North", region, null);
        service.deleteUnit(north.getId(), ADMIN);
        assertThat(units.existsById(north.getId())).isFalse();
        verify(audit).record("ORG_UNIT_DELETED", "OrgUnit", String.valueOf(north.getId()), "admin-uuid", "ADMIN", null);
    }

    @Test
    void overviewListsLevelsShallowestFirstAndUnitsByName() {
        OrgLevel branch = level("Branch", 3);
        OrgLevel head = level("Head Office", 1);
        unit("B-TLV", "Tel Aviv", branch, null);
        unit("B-HFA", "Haifa", branch, null);
        OrgOverview o = service.overview();
        assertThat(o.levels()).extracting(OrgLevel::getName).containsExactly("Head Office", "Branch");
        assertThat(o.units()).extracting(OrgUnit::getName).containsExactly("Haifa", "Tel Aviv");
        assertThat(head.getDepth()).isEqualTo(1);
    }
}
