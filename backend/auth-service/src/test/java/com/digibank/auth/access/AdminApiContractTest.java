package com.digibank.auth.access;

import com.digibank.auth.compliance.ComplianceAuditWriter;
import com.digibank.auth.config.GlobalExceptionHandler;
import com.digibank.auth.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * What the Angular admin pages actually read: paths, status codes and JSON key names, against the
 * same shapes the Worker produces (routes/admin-org.ts, routes/admin-roles.ts). The pages are written
 * once and talk to either backend, so a renamed key here would break them silently.
 */
@AccessDbTest
class AdminApiContractTest {

    @Autowired RoleRepository roles;
    @Autowired RoleEntitlementRepository entitlements;
    @Autowired OrgLevelRepository levels;
    @Autowired OrgUnitRepository units;
    @Autowired UserRepository users;

    final ObjectMapper json = new ObjectMapper();
    MockMvc mvc;

    @BeforeEach
    void setUp() {
        new AccessSeeder(roles, entitlements).seed();
        ComplianceAuditWriter audit = mock(ComplianceAuditWriter.class);
        RoleAdminService roleService = new RoleAdminService(roles, entitlements, users, new RoleConfigService(roles, entitlements), audit);
        OrgAdminService orgService = new OrgAdminService(levels, units, users, id -> 0, audit);
        mvc = MockMvcBuilders.standaloneSetup(new RoleAdminController(roleService), new OrgAdminController(orgService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("admin-uuid", null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private JsonNode body(MvcResult r) throws Exception {
        return json.readTree(r.getResponse().getContentAsString());
    }

    private static Set<String> keys(JsonNode n) {
        Set<String> out = new TreeSet<>();
        n.propertyNames().forEach(out::add);
        return out;
    }

    private MvcResult postJson(String url, String payload, int expected) throws Exception {
        return mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().is(expected)).andReturn();
    }

    @Test
    void rolesListHasTheWorkersTopLevelAndPerRoleKeys() throws Exception {
        JsonNode b = body(mvc.perform(get("/api/auth/admin/roles")).andExpect(status().isOk()).andReturn());
        assertThat(keys(b)).containsExactly("catalog", "roles", "scopes");
        assertThat(b.get("scopes").size()).isEqualTo(3);
        assertThat(keys(b.get("catalog").get(0))).containsExactly("description", "group", "key", "label");
        assertThat(keys(b.get("roles").get(0))).containsExactly(
                "code", "createdAt", "description", "entitlements", "escalationRank", "isSystem", "label", "locked", "scope", "userCount");
        assertThat(b.get("roles").get(0).get("createdAt").isString()).isTrue(); // an ISO string, as the Worker sends
        assertThat(b.get("roles").get(0).get("isSystem").isBoolean()).isTrue();
    }

    @Test
    void creatingARoleAnswers201WithJustItsCode() throws Exception {
        MvcResult r = postJson("/api/auth/admin/roles",
                "{\"code\":\"BRANCH_OFFICER\",\"label\":\"Branch Officer\",\"scope\":\"UNIT_ONLY\",\"entitlements\":[\"case.addNote\"]}", 201);
        JsonNode b = body(r);
        assertThat(keys(b)).containsExactly("code");
        assertThat(b.get("code").asString()).isEqualTo("BRANCH_OFFICER");
    }

    @Test
    void aRefusalIsSuccessFalseWithMessageAndNullDataAtTheRightStatus() throws Exception {
        MvcResult dup = postJson("/api/auth/admin/roles", "{\"code\":\"UNDERWRITER\",\"label\":\"x\",\"scope\":\"ALL\",\"entitlements\":[]}", 400);
        JsonNode b = body(dup);
        assertThat(keys(b)).containsExactly("data", "message", "success");
        assertThat(b.get("success").asBoolean()).isFalse();
        assertThat(b.get("message").asString()).isEqualTo("A role with that code already exists.");
        assertThat(b.get("data").isNull()).isTrue();

        mvc.perform(put("/api/auth/admin/roles/ADMIN").contentType(MediaType.APPLICATION_JSON)
                .content("{\"label\":\"Admin\",\"scope\":\"ALL\",\"entitlements\":[]}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/auth/admin/roles/NOPE").contentType(MediaType.APPLICATION_JSON)
                .content("{\"label\":\"N\",\"scope\":\"ALL\",\"entitlements\":[]}")).andExpect(status().isNotFound());
        mvc.perform(delete("/api/auth/admin/roles/UNDERWRITER")).andExpect(status().isForbidden());
    }

    @Test
    void invalidInputIsA400InTheSameShape() throws Exception {
        JsonNode b = body(postJson("/api/auth/admin/roles", "{\"code\":\"bad code\",\"label\":\"\",\"scope\":\"ALL\",\"entitlements\":[]}", 400));
        assertThat(b.get("success").asBoolean()).isFalse();
        assertThat(b.get("message").asString()).contains("Code must be 2-32 chars");
    }

    @Test
    void updateAnswersWithTheCodeAndDeleteWith204() throws Exception {
        postJson("/api/auth/admin/roles", "{\"code\":\"TEMP\",\"label\":\"Temp\",\"scope\":\"ALL\",\"entitlements\":[]}", 201);
        MvcResult upd = mvc.perform(put("/api/auth/admin/roles/TEMP").contentType(MediaType.APPLICATION_JSON)
                .content("{\"label\":\"Temp 2\",\"scope\":\"UNIT_TREE\",\"escalationRank\":9,\"entitlements\":[\"dashboard.view\"]}"))
                .andExpect(status().isOk()).andReturn();
        assertThat(body(upd).get("code").asString()).isEqualTo("TEMP");
        MvcResult del = mvc.perform(delete("/api/auth/admin/roles/TEMP")).andExpect(status().isNoContent()).andReturn();
        assertThat(del.getResponse().getContentAsString()).isEmpty();
    }

    @Test
    void orgOverviewAndEditsHaveTheWorkersKeys() throws Exception {
        MvcResult lvl = postJson("/api/auth/admin/org/levels", "{\"name\":\"Branch\",\"depth\":3}", 201);
        JsonNode level = body(lvl);
        assertThat(keys(level)).containsExactly("depth", "id", "name");
        MvcResult unit = postJson("/api/auth/admin/org/units",
                "{\"code\":\"B-HFA\",\"name\":\"Haifa\",\"levelId\":" + level.get("id").asLong() + ",\"parentId\":null}", 201);
        JsonNode u = body(unit);
        assertThat(keys(u)).containsExactly("active", "code", "createdAt", "id", "levelId", "name", "parentId");
        assertThat(u.get("active").asBoolean()).isTrue();
        assertThat(u.get("parentId").isNull()).isTrue();
        assertThat(u.get("createdAt").isString()).isTrue();

        JsonNode overview = body(mvc.perform(get("/api/auth/admin/org")).andExpect(status().isOk()).andReturn());
        assertThat(keys(overview)).containsExactly("levels", "units");
        assertThat(overview.get("units").size()).isEqualTo(1);

        mvc.perform(delete("/api/auth/admin/org/units/" + u.get("id").asLong())).andExpect(status().isNoContent());
        mvc.perform(delete("/api/auth/admin/org/levels/" + level.get("id").asLong())).andExpect(status().isNoContent());
    }

    @Test
    void orgRefusalsKeepTheirStatuses() throws Exception {
        mvc.perform(put("/api/auth/admin/org/levels/9999").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"X\",\"depth\":1}"))
                .andExpect(status().isNotFound());
        JsonNode b = body(postJson("/api/auth/admin/org/units", "{\"code\":\"Z\",\"name\":\"Z\",\"levelId\":9999}", 400));
        assertThat(b.get("message").asString()).isEqualTo("Unknown level.");
    }
}
