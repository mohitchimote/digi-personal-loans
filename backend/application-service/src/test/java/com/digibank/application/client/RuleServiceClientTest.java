package com.digibank.application.client;

import com.digibank.application.workflow.WorkflowUnavailableException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** The mandate comes from rule-service's resolve endpoint; a null limit is no authority; results are cached for a short while. */
class RuleServiceClientTest {

    static final String RESOLVE = "http://rules:8087/internal/rules/mandates/resolve";
    MockRestServiceServer server;
    RuleServiceClient client;

    @BeforeEach
    void setUp() {
        RestTemplate rest = new RestTemplate();
        server = MockRestServiceServer.createServer(rest);
        client = new RuleServiceClient(rest);
        ReflectionTestUtils.setField(client, "ruleServiceUrl", "http://rules:8087");
    }

    @Test
    void theLimitIsReadFromTheResolveEndpointWithTheCaseContext() {
        server.expect(requestTo(RESOLVE + "?role=UNDERWRITER&orgUnitId=3&applicationType=PERSONAL")).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"limit\":100000.0,\"orgUnitId\":3,\"applicationType\":\"PERSONAL\"}", MediaType.APPLICATION_JSON));
        assertThat(client.resolveMandateLimit("UNDERWRITER", 3L, "PERSONAL")).isEqualTo(100000.0);
        server.verify();
    }

    @Test
    void aNullLimitMeansNoAuthority() {
        server.expect(requestTo(RESOLVE + "?role=BANKER")).andRespond(withSuccess("{\"limit\":null,\"orgUnitId\":null,\"applicationType\":null}", MediaType.APPLICATION_JSON));
        assertThat(client.resolveMandateLimit("BANKER", null, null)).isNull();
    }

    @Test
    void aSecondAskWithinTheCacheWindowIsNotACall() {
        server.expect(once(), requestTo(RESOLVE + "?role=COO&orgUnitId=1&applicationType=BUSINESS"))
                .andRespond(withSuccess("{\"limit\":2000000,\"orgUnitId\":null,\"applicationType\":null}", MediaType.APPLICATION_JSON));
        assertThat(client.resolveMandateLimit("COO", 1L, "BUSINESS")).isEqualTo(2000000.0);
        assertThat(client.resolveMandateLimit("COO", 1L, "BUSINESS")).isEqualTo(2000000.0);
        server.verify();
    }

    @Test
    void ruleServiceBeingDownIs503() {
        server.expect(requestTo(RESOLVE + "?role=COO")).andRespond(r -> { throw new IOException("down"); });
        assertThatThrownBy(() -> client.resolveMandateLimit("COO", null, null)).isInstanceOf(WorkflowUnavailableException.class);
    }
}
