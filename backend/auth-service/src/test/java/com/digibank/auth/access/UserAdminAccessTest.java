package com.digibank.auth.access;

import com.digibank.auth.compliance.ComplianceAuditWriter;
import com.digibank.auth.dto.ApiResponse;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import com.digibank.auth.staffadmin.UserAdminController;
import com.digibank.auth.staffadmin.dto.CreateStaffRequest;
import com.digibank.auth.staffadmin.dto.UserSummaryResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** User administration against the roles and org tables: roles are no longer a hard-coded list. */
@AccessDbTest
class UserAdminAccessTest {

    @Autowired RoleRepository roles;
    @Autowired RoleEntitlementRepository entitlements;
    @Autowired OrgLevelRepository levels;
    @Autowired OrgUnitRepository units;
    @Autowired UserRepository users;

    ComplianceAuditWriter audit;
    UserAdminController controller;
    Long haifaId;

    @BeforeEach
    void setUp() {
        new AccessSeeder(roles, entitlements).seed();
        audit = mock(ComplianceAuditWriter.class);
        controller = new UserAdminController(users, audit, new RoleConfigService(roles, entitlements), units);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("admin-uuid", null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        OrgLevel branch = new OrgLevel();
        branch.setName("Branch");
        branch.setDepth(3);
        levels.saveAndFlush(branch);
        OrgUnit haifa = new OrgUnit();
        haifa.setCode("B-HFA");
        haifa.setName("Haifa");
        haifa.setLevelId(branch.getId());
        haifaId = units.saveAndFlush(haifa).getId();
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private User user(String email, String nid, String role) {
        return users.saveAndFlush(User.builder().email(email).nationalId(nid).fullName(email).role(role).build());
    }

    private static String errorOf(ResponseEntity<?> r) {
        return ((ApiResponse<?>) r.getBody()).getMessage();
    }

    @Test
    void staffAreThoseHoldingARoleInTheRolesTableNotAFixedList() {
        Role custom = new Role();
        custom.setCode("BRANCH_OFFICER");
        custom.setLabel("Branch Officer");
        roles.saveAndFlush(custom);
        user("officer@example.com", "000000071", "BRANCH_OFFICER");
        user("cust@example.com", "000000072", "CUSTOMER");

        List<UserSummaryResponse> staff = controller.getUsers("staff").getBody();
        assertThat(staff).extracting(UserSummaryResponse::getEmail).containsExactly("officer@example.com");
        assertThat(controller.getUsers("customers").getBody()).extracting(UserSummaryResponse::getEmail).containsExactly("cust@example.com");
        assertThat(controller.getUsers(null).getBody()).hasSize(2);
    }

    @Test
    void aRoleChangeMustNameARoleThatExistsAndRevokesSessions() {
        User u = user("u@example.com", "000000073", "BANKER");
        assertThat(errorOf(controller.updateRole(u.getId(), Map.of("role", "WIZARD")))).isEqualTo("Unknown role.");
        assertThat(controller.updateRole(u.getId(), Map.of("role", "WIZARD")).getStatusCode().value()).isEqualTo(400);

        ResponseEntity<ApiResponse<UserSummaryResponse>> ok = controller.updateRole(u.getId(), Map.of("role", "UNDERWRITER"));
        assertThat(ok.getBody().getData().getRole()).isEqualTo("UNDERWRITER");
        assertThat(users.findById(u.getId()).orElseThrow().getSessionsRevokedAt()).isNotNull();
        verify(audit).record(eq("ROLE_CHANGED"), eq("User"), eq(u.getId().toString()), eq("admin-uuid"), eq("ADMIN"), eq("BANKER -> UNDERWRITER"));
    }

    @Test
    void customerRolesRemainValidTargets() {
        User u = user("c@example.com", "000000074", "BANKER");
        assertThat(controller.updateRole(u.getId(), Map.of("role", "CUSTOMER")).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void assigningAnOrgUnitIsForStaffOnlyNeedsARealUnitAndRevokesSessions() {
        User staff = user("s@example.com", "000000075", "BANKER");
        User customer = user("k@example.com", "000000076", "CUSTOMER");

        assertThat(errorOf(controller.setOrgUnit(customer.getId(), Map.of("orgUnitId", haifaId)))).isEqualTo("Only staff users can be assigned to an org unit.");
        assertThat(errorOf(controller.setOrgUnit(staff.getId(), Map.of("orgUnitId", 9999)))).isEqualTo("Unknown org unit.");

        ResponseEntity<ApiResponse<UserSummaryResponse>> ok = controller.setOrgUnit(staff.getId(), Map.of("orgUnitId", haifaId));
        assertThat(ok.getBody().getMessage()).isEqualTo("Org unit updated.");
        assertThat(ok.getBody().getData().getOrgUnitId()).isEqualTo(haifaId);
        User reloaded = users.findById(staff.getId()).orElseThrow();
        assertThat(reloaded.getOrgUnitId()).isEqualTo(haifaId);
        assertThat(reloaded.getSessionsRevokedAt()).isNotNull();
        verify(audit).record(eq("USER_ORG_UNIT_CHANGED"), eq("User"), eq(staff.getId().toString()), eq("admin-uuid"), eq("ADMIN"), eq("none -> " + haifaId));
    }

    @Test
    void anOrgUnitCanBeClearedWithNull() {
        User staff = user("s2@example.com", "000000077", "BANKER");
        controller.setOrgUnit(staff.getId(), Map.of("orgUnitId", haifaId));
        Map<String, Object> clear = new java.util.HashMap<>();
        clear.put("orgUnitId", null);
        assertThat(controller.setOrgUnit(staff.getId(), clear).getStatusCode().value()).isEqualTo(200);
        assertThat(users.findById(staff.getId()).orElseThrow().getOrgUnitId()).isNull();
    }

    @Test
    void creatingStaffChecksTheRoleAgainstTheTableAndTheUnitAgainstTheHierarchy() throws Exception {
        ObjectMapper json = new ObjectMapper();
        CreateStaffRequest good = json.readValue(
                "{\"email\":\"new@example.com\",\"fullName\":\"New\",\"nationalId\":\"000000078\",\"role\":\"BANKER\",\"orgUnitId\":" + haifaId + "}",
                CreateStaffRequest.class);
        assertThat(controller.createStaffUser(good).getStatusCode().value()).isEqualTo(201);
        assertThat(users.findByEmail("new@example.com").orElseThrow().getOrgUnitId()).isEqualTo(haifaId);

        CreateStaffRequest badRole = json.readValue(
                "{\"email\":\"x@example.com\",\"fullName\":\"X\",\"nationalId\":\"000000079\",\"role\":\"CUSTOMER\"}", CreateStaffRequest.class);
        assertThat(errorOf(controller.createStaffUser(badRole))).isEqualTo("Invalid staff role.");

        CreateStaffRequest badUnit = json.readValue(
                "{\"email\":\"y@example.com\",\"fullName\":\"Y\",\"nationalId\":\"000000080\",\"role\":\"BANKER\",\"orgUnitId\":9999}", CreateStaffRequest.class);
        assertThat(errorOf(controller.createStaffUser(badUnit))).isEqualTo("Unknown org unit.");
    }
}
