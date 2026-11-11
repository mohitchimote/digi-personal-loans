package com.digibank.application.org;

import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.security.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = InternalOrgController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class, JsonAccessDeniedHandler.class})
@TestPropertySource(properties = {
        "app.jwt.secret=test-secret-test-secret-test-secret-0123456789",
        "app.auth-service.url=http://localhost:1",
        "eureka.client.enabled=false", "spring.cloud.discovery.enabled=false"
})
class InternalOrgControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean SessionRevocationCache revocation;
    @MockitoBean LoanApplicationRepository repository;

    @Test
    void answersTheCaseCountForAUnitToADirectInternalCallWithNoCredentials() throws Exception {
        when(repository.countByOrgUnitId(7L)).thenReturn(3L);
        mvc.perform(get("/api/applications/internal/org-units/7/case-count"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(3));
    }

    @Test
    void aUnitWithNoCasesCountsZero() throws Exception {
        when(repository.countByOrgUnitId(8L)).thenReturn(0L);
        mvc.perform(get("/api/applications/internal/org-units/8/case-count"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(0));
    }

    @Test
    void aRequestThatCameThroughTheGatewayIsRefused() throws Exception {
        when(repository.countByOrgUnitId(7L)).thenReturn(3L);
        mvc.perform(get("/api/applications/internal/org-units/7/case-count").header("X-Forwarded-Host", "bank.example"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/applications/internal/org-units/7/case-count").header("Forwarded", "host=bank.example"))
                .andExpect(status().isForbidden());
    }
}
