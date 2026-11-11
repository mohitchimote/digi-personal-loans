package com.digibank.auth.access;

import com.digibank.auth.compliance.ComplianceAuditWriter;
import com.digibank.auth.internal.InternalKey;
import com.digibank.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** The org-unit delete asks application-service how many cases the unit holds, and refuses when it cannot be told. */
@AccessDbTest
class ApplicationCaseCountsTest {

    static final String SECRET = "test-secret-test-secret-test-secret-0123456789";
    static final String URL = "http://apps/api/applications/internal/org-units/%d/case-count";

    @Autowired OrgLevelRepository levels;
    @Autowired OrgUnitRepository units;
    @Autowired UserRepository users;

    MockRestServiceServer server;
    ApplicationCaseCounts counts;
    OrgAdminService service;
    ComplianceAuditWriter audit;
    Long unitId;

    @BeforeEach
    void setUp() {
        RestTemplate rest = new RestTemplate();
        server = MockRestServiceServer.createServer(rest);
        counts = new ApplicationCaseCounts(rest, "http://apps", SECRET);
        audit = mock(ComplianceAuditWriter.class);
        service = new OrgAdminService(levels, units, users, counts, audit);
        OrgLevel branch = new OrgLevel();
        branch.setName("Branch");
        branch.setDepth(3);
        levels.saveAndFlush(branch);
        OrgUnit u = new OrgUnit();
        u.setCode("B-1");
        u.setName("Branch One");
        u.setLevelId(branch.getId());
        unitId = units.saveAndFlush(u).getId();
    }

    private String url() {
        return URL.formatted(unitId);
    }

    @Test
    void readsTheCountPresentingTheInternalKey() {
        server.expect(requestTo(url())).andExpect(method(org.springframework.http.HttpMethod.GET))
                .andExpect(header(InternalKey.HEADER, InternalKey.derive(SECRET)))
                .andRespond(withSuccess("{\"count\":4}", MediaType.APPLICATION_JSON));
        assertThat(counts.caseCount(unitId)).isEqualTo(4);
        server.verify();
    }

    @Test
    void aUnitWithCasesCannotBeDeletedAndTheMessageIsTheWorkers() {
        server.expect(requestTo(url())).andRespond(withSuccess("{\"count\":3}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> service.deleteUnit(unitId, new AdminActor("a", "ADMIN")))
                .isInstanceOfSatisfying(AdminApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(400);
                    assertThat(e.getMessage()).isEqualTo("Unit still has 0 child unit(s), 0 staff user(s) and 3 case(s) - deactivate it instead of deleting.");
                });
        assertThat(units.existsById(unitId)).isTrue();
    }

    @Test
    void anEmptyUnitIsDeleted() {
        server.expect(requestTo(url())).andRespond(withSuccess("{\"count\":0}", MediaType.APPLICATION_JSON));
        service.deleteUnit(unitId, new AdminActor("a", "ADMIN"));
        assertThat(units.existsById(unitId)).isFalse();
    }

    @Test
    void whenTheApplicationServiceFailsTheDeleteIsRefusedNotAllowed() {
        server.expect(requestTo(url())).andRespond(withServerError());
        assertThatThrownBy(() -> service.deleteUnit(unitId, new AdminActor("a", "ADMIN")))
                .isInstanceOfSatisfying(AdminApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(503);
                    assertThat(e.getMessage()).contains("Cannot confirm whether this unit has cases").contains("not deleted");
                });
        assertThat(units.existsById(unitId)).isTrue();
    }

    @Test
    void anUnreachableOrNonsensicalAnswerIsAlsoARefusal() {
        for (String body : new String[] {"{}", "{\"count\":\"many\"}", "{\"count\":-1}", "null"}) {
            server.reset();
            server.expect(requestTo(url())).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
            assertThatThrownBy(() -> counts.caseCount(unitId)).isInstanceOfSatisfying(AdminApiException.class,
                    e -> assertThat(e.getStatus()).isEqualTo(503));
        }
        assertThat(units.existsById(unitId)).isTrue();
    }
}
