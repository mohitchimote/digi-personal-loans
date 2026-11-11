package com.digibank.document.security;

import com.digibank.document.config.AppException;
import com.digibank.document.generation.GeneratedDocument;
import com.digibank.document.generation.GenerationController;
import com.digibank.document.generation.GenerationService;
import com.digibank.document.storage.StorageController;
import com.digibank.document.storage.StorageService;
import com.digibank.document.storage.UploadedDocument;
import com.digibank.document.util.OpaqueId;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The real security configuration and token filter, driven with real signed tokens. */
@WebMvcTest(controllers = {StorageController.class, GenerationController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class, JsonAccessDeniedHandler.class})
@TestPropertySource(properties = {
        "app.jwt.secret=test-secret-test-secret-test-secret-0123456789",
        "app.auth-service.url=http://localhost:1",
        "eureka.client.enabled=false", "spring.cloud.discovery.enabled=false"
})
class EndpointPermissionsTest {

    static final String SECRET = "test-secret-test-secret-test-secret-0123456789";

    @Autowired MockMvc mvc;
    @Autowired org.springframework.boot.web.servlet.FilterRegistrationBean<JwtAuthenticationFilter> filterRegistration;
    @MockitoBean SessionRevocationCache revocation;
    @MockitoBean StorageService storageService;
    @MockitoBean GenerationService generationService;

    private static String token(String role, long userId, String roleLabel) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", role);
        claims.put("userId", userId);
        if (roleLabel != null) claims.put("roleLabel", roleLabel);
        Date now = new Date();
        return Jwts.builder().setClaims(claims).setSubject("uuid-" + userId).setIssuedAt(now)
                .setExpiration(new Date(now.getTime() + 3_600_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes()), SignatureAlgorithm.HS256).compact();
    }

    private final String customer8 = token("CUSTOMER", 8, null);
    private final String staff = token("UNDERWRITER", 99, "Underwriter");

    private static MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder b, String bearer) {
        return b.header("Authorization", "Bearer " + bearer);
    }

    private static GeneratedDocument generatedFor(long customerId) {
        GeneratedDocument d = new GeneratedDocument();
        d.setCustomerId(customerId);
        d.setDocumentName("Final Approval Letter");
        return d;
    }

    private static UploadedDocument uploadedFor(long customerId) {
        UploadedDocument d = new UploadedDocument();
        d.setCustomerId(customerId);
        d.setOriginalFilename("id.pdf");
        d.setMimeType("application/pdf");
        return d;
    }

    @Test
    void everyRouteRejectsAnUnauthenticatedCaller() throws Exception {
        mvc.perform(get("/api/documents/customer/8")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/documents/application/APP-1")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/documents/doc_1/download")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/documents/doc_1/view")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/documents/uploaded/APP-1")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/documents/uploaded/file/upl_1/view")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/documents/uploaded/file/upl_1/download")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/documents/generate").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/documents/upload").file(new MockMultipartFile("file", "a.pdf", "application/pdf", new byte[]{1})))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(storageService, generationService);
    }

    @Test
    void aCustomerCannotFetchAnotherCustomersGeneratedDocument() throws Exception {
        when(generationService.getGeneratedById(5L)).thenReturn(generatedFor(9L));
        String id = OpaqueId.encode("doc", 5L);
        mvc.perform(auth(get("/api/documents/" + id + "/download"), customer8)).andExpect(status().isForbidden());
        mvc.perform(auth(get("/api/documents/" + id + "/view"), customer8)).andExpect(status().isForbidden());
        verify(generationService, never()).getGeneratedBytes(any());
    }

    @Test
    void aCustomerFetchesTheirOwnAndStaffFetchAnyGeneratedDocument() throws Exception {
        when(generationService.getGeneratedById(5L)).thenReturn(generatedFor(8L));
        when(generationService.getGeneratedBytes(5L)).thenReturn("%PDF-".getBytes());
        String id = OpaqueId.encode("doc", 5L);
        mvc.perform(auth(get("/api/documents/" + id + "/download"), customer8))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Disposition", "attachment; filename=\"Final Approval Letter.pdf\""));
        mvc.perform(auth(get("/api/documents/" + id + "/view"), staff))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Disposition", "inline; filename=\"Final Approval Letter.pdf\""));
    }

    @Test
    void uploadedFilesFollowTheSameOwnershipRule() throws Exception {
        when(storageService.getUploadedById(7L)).thenReturn(uploadedFor(9L));
        String id = OpaqueId.encode("upl", 7L);
        mvc.perform(auth(get("/api/documents/uploaded/file/" + id + "/view"), customer8)).andExpect(status().isForbidden());
        mvc.perform(auth(get("/api/documents/uploaded/file/" + id + "/download"), customer8)).andExpect(status().isForbidden());
        verify(storageService, never()).getUploadedBytes(any());
        when(storageService.getUploadedBytes(7L)).thenReturn(new byte[]{1});
        mvc.perform(auth(get("/api/documents/uploaded/file/" + id + "/view"), staff)).andExpect(status().isOk());
    }

    @Test
    void anIdOfTheWrongKindIs400WithTheWorkersMessage() throws Exception {
        mvc.perform(auth(get("/api/documents/" + OpaqueId.encode("upl", 1L) + "/download"), customer8))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Invalid id."));
    }

    @Test
    void anUnknownDocumentIs400LikeTheWorkersAppError() throws Exception {
        String id = OpaqueId.encode("doc", 6L);
        when(generationService.getGeneratedById(6L)).thenThrow(new AppException("Document not found: " + id));
        mvc.perform(auth(get("/api/documents/" + id + "/view"), customer8))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Document not found: " + id))
                .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void generateRejectsAnUnknownDocumentType() throws Exception {
        mvc.perform(auth(post("/api/documents/generate").contentType(MediaType.APPLICATION_JSON).content("{\"documentType\":\"LOAN_AGREEMENT\"}"), customer8))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Unknown document type: LOAN_AGREEMENT"));
    }

    @Test
    void generateTreatsFinalApprovalLetterAsTheFinalPack() throws Exception {
        when(generationService.generateOfferPack(any(), org.mockito.ArgumentMatchers.eq(true))).thenReturn(List.of(generatedFor(8L)));
        mvc.perform(auth(post("/api/documents/generate").contentType(MediaType.APPLICATION_JSON).content("{\"documentType\":\"FINAL_APPROVAL_LETTER\"}"), customer8))
                .andExpect(status().isOk());
        verify(generationService).generateOfferPack(any(), org.mockito.ArgumentMatchers.eq(true));
    }

    @Test
    void uploadWithoutAFileIs400WithTheWorkersMessage() throws Exception {
        mvc.perform(multipart("/api/documents/upload").param("applicationRef", "APP-1").param("customerId", "8")
                        .header("Authorization", "Bearer " + customer8))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("A file is required."));
    }

    @Test
    void theTokenFilterIsRegisteredOnlyInsideTheSecurityChain() {
        assertThat(filterRegistration.isEnabled()).isFalse();
    }
}
