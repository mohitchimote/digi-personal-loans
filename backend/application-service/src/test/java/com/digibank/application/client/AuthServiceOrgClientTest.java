package com.digibank.application.client;

import com.digibank.application.org.OrgUnitInfo;
import org.junit.jupiter.api.Test;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

class AuthServiceOrgClientTest {

    static final String URL = "http://auth:8081/api/auth/internal/org/units";
    final RestTemplate rest = mock(RestTemplate.class);
    final AuthServiceOrgClient client = new AuthServiceOrgClient(rest, "http://auth:8081", "test-secret");
    final List<OrgUnitInfo> units = List.of(new OrgUnitInfo(1L, null, 1L, "Bank", "BANK", true));

    @SuppressWarnings("unchecked")
    private void answers(ResponseEntity<List<OrgUnitInfo>> r) {
        when(rest.exchange(eq(URL), eq(HttpMethod.GET), any(org.springframework.http.HttpEntity.class), any(ParameterizedTypeReference.class))).thenReturn((ResponseEntity) r);
    }

    @SuppressWarnings("unchecked")
    private void verifyCalls(int n) {
        verify(rest, times(n)).exchange(eq(URL), eq(HttpMethod.GET), any(org.springframework.http.HttpEntity.class), any(ParameterizedTypeReference.class));
    }

    @Test
    void readsTheUnitListFromAuthServiceAndCachesIt() {
        answers(ResponseEntity.ok(units));
        assertThat(client.units()).isEqualTo(units);
        assertThat(client.units()).isEqualTo(units);
        verifyCalls(1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void anUnreachableAuthServiceGivesAnEmptyListWhenNothingIsCached() {
        when(rest.exchange(eq(URL), eq(HttpMethod.GET), any(org.springframework.http.HttpEntity.class), any(ParameterizedTypeReference.class)))
                .thenThrow(new ResourceAccessException("down"));
        assertThat(client.units()).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void anOutageAfterASuccessfulReadKeepsTheLastGoodList() {
        answers(ResponseEntity.ok(units));
        client.units();
        ReflectionTestUtils.setField(client, "cachedAt", 1L); // long expired
        when(rest.exchange(eq(URL), eq(HttpMethod.GET), any(org.springframework.http.HttpEntity.class), any(ParameterizedTypeReference.class)))
                .thenThrow(new ResourceAccessException("down"));
        assertThat(client.units()).isEqualTo(units);
    }
}
