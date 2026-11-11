package com.digibank.auth.internal;

import com.digibank.auth.access.*;
import com.digibank.auth.compliance.ComplianceAuditWriter;
import com.digibank.auth.internal.InternalDirectoryService.StaffView;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AccessDbTest
class InternalDirectoryServiceTest {

    @Autowired RoleRepository roles;
    @Autowired RoleEntitlementRepository entitlements;
    @Autowired OrgLevelRepository levels;
    @Autowired OrgUnitRepository units;
    @Autowired UserRepository users;

    ComplianceAuditWriter audit;
    InternalDirectoryService service;
    MockMvc mvc;
    final ObjectMapper json = new ObjectMapper();
    Long hq, north, haifa;

    @BeforeEach
    void setUp() {
        new AccessSeeder(roles, entitlements).seed();
        audit = mock(ComplianceAuditWriter.class);
        service = new InternalDirectoryService(units, new RoleConfigService(roles, entitlements), users, audit);
        mvc = MockMvcBuilders.standaloneSetup(new InternalDirectoryController(service))
                .setControllerAdvice(new com.digibank.auth.config.GlobalExceptionHandler()).build();

        OrgLevel head = level("Head Office", 1), region = level("Region", 2), branch = level("Branch", 3);
        hq = unit("HQ", "Head Office", head, null);
        north = unit("RN", "North", region, hq);
        haifa = unit("B-HFA", "Haifa", branch, north);
    }

    private OrgLevel level(String name, int depth) {
        OrgLevel l = new OrgLevel();
        l.setName(name);
        l.setDepth(depth);
        return levels.saveAndFlush(l);
    }

    private Long unit(String code, String name, OrgLevel level, Long parent) {
        OrgUnit u = new OrgUnit();
        u.setCode(code);
        u.setName(name);
        u.setLevelId(level.getId());
        u.setParentId(parent);
        return units.saveAndFlush(u).getId();
    }

    private User user(String email, String nid, String role, Long unit) {
        User u = User.builder().email(email).nationalId(nid).fullName(email).role(role).enabled(true).build();
        u.setOrgUnitId(unit);
        return users.saveAndFlush(u);
    }

    private static Set<String> keys(JsonNode n) {
        Set<String> out = new TreeSet<>();
        n.propertyNames().forEach(out::add);
        return out;
    }

    // ---- org units and roles

    @Test
    void orgUnitsAreAFlatListWithTheKeysTheOtherServicesRead() throws Exception {
        JsonNode b = json.readTree(mvc.perform(get("/api/auth/internal/org/units")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(b.isArray()).isTrue();
        assertThat(b.size()).isEqualTo(3);
        assertThat(keys(b.get(0))).containsExactly("active", "code", "id", "levelId", "name", "parentId");
        assertThat(b.get(0).get("parentId").isNull()).isTrue();
        assertThat(b.get(2).get("parentId").asLong()).isEqualTo(north);
        assertThat(b.get(2).get("code").asString()).isEqualTo("B-HFA");
    }

    @Test
    void theLadderIsTheRankedRolesMostJuniorFirst() throws Exception {
        JsonNode b = json.readTree(mvc.perform(get("/api/auth/internal/roles/ladder")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(b.size()).isEqualTo(5);
        assertThat(keys(b.get(0))).containsExactly("code", "label", "rank");
        List<String> codes = new java.util.ArrayList<>();
        b.forEach(n -> codes.add(n.get("code").asString()));
        assertThat(codes).containsExactly("UNDERWRITER", "SENIOR_UNDERWRITER", "HEAD_OF_LENDING", "COO", "CEO");
        assertThat(b.get(0).get("rank").asInt()).isLessThan(b.get(4).get("rank").asInt());
    }

    @Test
    void aRoleOffTheLadderIsNotListedAndOneAddedLaterIsInItsPlace() {
        Role r = new Role();
        r.setCode("DIRECTOR");
        r.setLabel("Director");
        r.setEscalationRank(35); // between HEAD_OF_LENDING and COO is not assumed: just check ordering by rank
        roles.saveAndFlush(r);
        List<String> codes = service.ladder().stream().map(InternalDirectoryService.LadderRoleView::code).toList();
        assertThat(codes).contains("DIRECTOR").doesNotContain("BANKER", "ADMIN");
        assertThat(service.ladder()).isSortedAccordingTo(java.util.Comparator.comparingInt(InternalDirectoryService.LadderRoleView::rank));
    }

    @Test
    void aRoleConfigCarriesEntitlementsScopeRankAndLabel() throws Exception {
        JsonNode b = json.readTree(mvc.perform(get("/api/auth/internal/roles/UNDERWRITER")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(keys(b)).containsExactly("code", "entitlements", "isStaff", "label", "rank", "scope");
        assertThat(b.get("isStaff").asBoolean()).isTrue();
        assertThat(b.get("rank").isInt()).isTrue();
        List<String> held = new java.util.ArrayList<>();
        b.get("entitlements").forEach(n -> held.add(n.asString()));
        assertThat(held).contains("case.approve", "queue.pipeline");
    }

    @Test
    void anUnknownRoleHoldsNothingAndIsNotStaff() throws Exception {
        JsonNode b = json.readTree(mvc.perform(get("/api/auth/internal/roles/CUSTOMER")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(b.get("isStaff").asBoolean()).isFalse();
        assertThat(b.get("entitlements").size()).isZero();
        assertThat(b.get("rank").isNull()).isTrue();
    }

    // ---- staff

    @Test
    void staffAreEnabledPeopleInStaffRolesOnlyWithTheWorkersFields() throws Exception {
        user("uw@example.com", "000000201", "UNDERWRITER", haifa);
        user("cust@example.com", "000000202", "CUSTOMER", null);
        User off = user("off@example.com", "000000203", "UNDERWRITER", haifa);
        off.setEnabled(false);
        users.saveAndFlush(off);

        MvcResult r = mvc.perform(get("/api/auth/internal/staff")).andExpect(status().isOk()).andReturn();
        JsonNode b = json.readTree(r.getResponse().getContentAsString());
        assertThat(b.size()).isEqualTo(1);
        assertThat(keys(b.get(0))).contains("available", "fullName", "orgUnitId", "role", "userId", "uuid");
        assertThat(b.get(0).get("role").asString()).isEqualTo("UNDERWRITER");
        assertThat(b.get(0).get("available").asBoolean()).isTrue();
        assertThat(b.get(0).get("uuid").asString()).isNotBlank();
    }

    @Test
    void staffCanBeNarrowedByRoleAndByOrgUnit() {
        user("a@example.com", "000000211", "UNDERWRITER", haifa);
        user("b@example.com", "000000212", "UNDERWRITER", north);
        user("c@example.com", "000000213", "SENIOR_UNDERWRITER", haifa);
        user("d@example.com", "000000214", "UNDERWRITER", null);

        assertThat(emails(service.staff(List.of("UNDERWRITER"), null))).containsExactlyInAnyOrder("a@example.com", "b@example.com", "d@example.com");
        assertThat(emails(service.staff(List.of("UNDERWRITER", "SENIOR_UNDERWRITER"), List.of(haifa)))).containsExactlyInAnyOrder("a@example.com", "c@example.com");
        assertThat(emails(service.staff(List.of("UNDERWRITER"), List.of(haifa, north)))).containsExactlyInAnyOrder("a@example.com", "b@example.com");
        // someone placed in no unit never matches a unit filter
        assertThat(emails(service.staff(List.of("UNDERWRITER"), List.of(hq)))).isEmpty();
        // a role that is not a staff role yields nobody, even when people hold it
        assertThat(service.staff(List.of("CUSTOMER", "NOPE"), null)).isEmpty();
    }

    private static List<String> emails(List<StaffView> staff) {
        return staff.stream().map(StaffView::fullName).toList();
    }

    @Test
    void unavailablePeopleAreStillListedButFlagged() {
        User u = user("busy@example.com", "000000221", "UNDERWRITER", haifa);
        service.setAvailable(u.getId(), false);
        List<StaffView> staff = service.staff(List.of("UNDERWRITER"), null);
        assertThat(staff).singleElement().satisfies(s -> assertThat(s.available()).isFalse());
    }

    // ---- availability

    @Test
    void everyoneIsAvailableByDefaultAndTheFlagIsStoredOnTheUser() {
        User u = user("x@example.com", "000000231", "BANKER", null);
        assertThat(service.isAvailable(u.getId())).isTrue();
        assertThat(service.setAvailable(u.getId(), false)).isFalse();
        assertThat(users.findById(u.getId()).orElseThrow().isAvailable()).isFalse();
        assertThat(service.isAvailable(u.getId())).isFalse();
        service.setAvailable(u.getId(), true);
        assertThat(service.isAvailable(u.getId())).isTrue();
    }

    @Test
    void changingAvailabilityIsAuditedLikeTheWorkers() {
        User u = user("y@example.com", "000000232", "BANKER", null);
        service.setAvailable(u.getId(), false);
        service.setAvailable(u.getId(), true);
        verify(audit).record("STAFF_UNAVAILABLE", "User", u.getId().toString(), "y@example.com", "BANKER", null);
        verify(audit).record("STAFF_AVAILABLE", "User", u.getId().toString(), "y@example.com", "BANKER", null);
    }

    @Test
    void onlyStaffHaveAnAvailabilityAndAnUnknownUserIs404() {
        User customer = user("z@example.com", "000000233", "CUSTOMER", null);
        assertThatThrownBy(() -> service.setAvailable(customer.getId(), false))
                .isInstanceOfSatisfying(AdminApiException.class, e -> assertThat(e.getStatus()).isEqualTo(403));
        assertThatThrownBy(() -> service.isAvailable(99999))
                .isInstanceOfSatisfying(AdminApiException.class, e -> assertThat(e.getStatus()).isEqualTo(404));
        assertThat(users.findById(customer.getId()).orElseThrow().isAvailable()).isTrue();
    }

    @Test
    void theAvailabilityEndpointsReadAndWriteTheFlag() throws Exception {
        User u = user("w@example.com", "000000234", "BANKER", null);
        String url = "/api/auth/internal/staff/" + u.getId() + "/availability";
        assertThat(json.readTree(mvc.perform(get(url)).andReturn().getResponse().getContentAsString()).get("available").asBoolean()).isTrue();
        MvcResult r = mvc.perform(put(url).contentType(MediaType.APPLICATION_JSON).content("{\"available\":false}")).andExpect(status().isOk()).andReturn();
        assertThat(json.readTree(r.getResponse().getContentAsString()).get("available").asBoolean()).isFalse();
        assertThat(users.findById(u.getId()).orElseThrow().isAvailable()).isFalse();
        mvc.perform(put("/api/auth/internal/staff/99999/availability").contentType(MediaType.APPLICATION_JSON).content("{\"available\":true}"))
                .andExpect(status().isNotFound());
    }
}
