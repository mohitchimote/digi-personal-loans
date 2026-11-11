package com.digibank.rule.directory;

import com.digibank.rule.security.InternalKey;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.lang.reflect.Field;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class HttpAuthDirectoryTest {

    static final String SECRET = "test-secret-test-secret-test-secret-0123456789";
    static final String UNITS = "[{\"id\":1,\"parentId\":null,\"levelId\":1,\"name\":\"HQ\",\"code\":\"HQ\",\"active\":true},"
            + "{\"id\":2,\"parentId\":1,\"levelId\":2,\"name\":\"North\",\"code\":\"N\",\"active\":true}]";

    MockRestServiceServer server;
    HttpAuthDirectory directory;

    @BeforeEach
    void setUp() {
        RestTemplate rest = new RestTemplate();
        server = MockRestServiceServer.createServer(rest);
        directory = new HttpAuthDirectory(rest, "http://auth", SECRET);
    }

    @Test
    void readsTheOrgUnitsPresentingTheDerivedInternalKey() {
        server.expect(requestTo("http://auth/api/auth/internal/org/units")).andExpect(method(HttpMethod.GET))
                .andExpect(header(InternalKey.HEADER, InternalKey.derive(SECRET)))
                .andRespond(withSuccess(UNITS, MediaType.APPLICATION_JSON));
        assertThat(directory.orgUnits()).containsExactly(
                new AuthDirectory.OrgUnitInfo(1L, null), new AuthDirectory.OrgUnitInfo(2L, 1L));
        server.verify();
    }

    @Test
    void readsTheLadder() {
        server.expect(requestTo("http://auth/api/auth/internal/roles/ladder"))
                .andRespond(withSuccess("[{\"code\":\"UNDERWRITER\",\"label\":\"Underwriter\",\"rank\":1}]", MediaType.APPLICATION_JSON));
        assertThat(directory.ladder()).containsExactly(new AuthDirectory.LadderRole("UNDERWRITER", "Underwriter", 1));
    }

    @Test
    void aSecondReadWithinTheTtlIsServedFromTheCache() {
        server.expect(times(1), requestTo("http://auth/api/auth/internal/org/units")).andRespond(withSuccess(UNITS, MediaType.APPLICATION_JSON));
        directory.orgUnits();
        directory.orgUnits();
        server.verify();
    }

    @Test
    void withNothingCachedAFailureIsReportedNotInvented() {
        server.expect(requestTo("http://auth/api/auth/internal/org/units")).andRespond(withServerError());
        assertThatThrownBy(() -> directory.orgUnits()).isInstanceOf(DirectoryUnavailableException.class);
    }

    @Test
    void aStaleAnswerIsUsedWhenARefreshFails() throws Exception {
        server.expect(requestTo("http://auth/api/auth/internal/org/units")).andRespond(withSuccess(UNITS, MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://auth/api/auth/internal/org/units")).andRespond(withServerError());
        directory.orgUnits();
        expire("units");
        assertThat(directory.orgUnits()).hasSize(2);
        server.verify();
    }

    /** Pushes the cached entry past its TTL. */
    private void expire(String field) throws Exception {
        Field f = HttpAuthDirectory.class.getDeclaredField(field);
        f.setAccessible(true);
        Object cached = f.get(directory);
        Field at = cached.getClass().getDeclaredField("loadedAt");
        at.setAccessible(true);
        at.setLong(cached, 0L);
    }

    @Test
    void theInternalKeyIsDerivedFromTheSecretAndDiffersPerSecret() {
        assertThat(InternalKey.derive(SECRET)).hasSize(64).isEqualTo(InternalKey.derive(SECRET))
                .isNotEqualTo(InternalKey.derive(SECRET + "x")).isNotEqualTo(SECRET);
    }
}
