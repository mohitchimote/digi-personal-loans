package com.digibank.notification.security;

import com.digibank.notification.controller.NotificationController;
import com.digibank.notification.email.EmailDeliveryController;
import com.digibank.notification.email.EmailDeliveryService;
import com.digibank.notification.email.EmailTemplateAdminController;
import com.digibank.notification.email.EmailTemplateAdminService;
import com.digibank.notification.model.Notification;
import com.digibank.notification.service.NotificationService;
import com.digibank.notification.util.OpaqueId;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The real security configuration and token filter, driven with real signed tokens. */
@WebMvcTest(controllers = {NotificationController.class, EmailTemplateAdminController.class, EmailDeliveryController.class})
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
    @MockitoBean NotificationService notificationService;
    @MockitoBean EmailTemplateAdminService emailTemplateAdminService;
    @MockitoBean EmailDeliveryService emailDeliveryService;

    private static String token(String role, long userId, String roleLabel) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", role);
        claims.put("userId", userId);
        claims.put("email", role.toLowerCase() + "@example.com");
        if (roleLabel != null) claims.put("roleLabel", roleLabel);
        Date now = new Date();
        return Jwts.builder().setClaims(claims).setSubject("uuid-" + userId).setIssuedAt(now)
                .setExpiration(new Date(now.getTime() + 3_600_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes()), SignatureAlgorithm.HS256).compact();
    }

    private final String customer8 = token("CUSTOMER", 8, null);
    private final String underwriter = token("UNDERWRITER", 99, "Underwriter");
    private final String admin = token("ADMIN", 1, "Administrator");

    private static MockHttpServletRequestBuilder withAuth(MockHttpServletRequestBuilder b, String bearer) {
        return bearer == null ? b : b.header("Authorization", "Bearer " + bearer);
    }

    private static Notification notificationOf(long customerId) {
        Notification n = new Notification();
        n.setCustomerId(customerId);
        return n;
    }

    @Test
    void everyRouteRejectsAnUnauthenticatedCaller() throws Exception {
        mvc.perform(get("/api/notifications/customer/8")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/notifications/customer/8/unread-count")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/notifications/ntf_1/read")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/notifications/customer/8/read-all")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/notifications/create").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/notifications/customer/8/seed-welcome")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/notifications/create-from-template").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/notifications/email/send").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/admin/email-templates")).andExpect(status().isUnauthorized());
        verifyNoInteractions(notificationService);
    }

    @Test
    void aCustomerReadsOnlyTheirOwnNotifications() throws Exception {
        mvc.perform(withAuth(get("/api/notifications/customer/8"), customer8)).andExpect(status().isOk());
        mvc.perform(withAuth(get("/api/notifications/customer/9"), customer8))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value("Forbidden."));
        mvc.perform(withAuth(get("/api/notifications/customer/9/unread-count"), customer8)).andExpect(status().isForbidden());
        mvc.perform(withAuth(put("/api/notifications/customer/9/read-all"), customer8)).andExpect(status().isForbidden());
        verify(notificationService).getNotifications(8L);
    }

    @Test
    void staffReadAnyCustomersNotifications() throws Exception {
        mvc.perform(withAuth(get("/api/notifications/customer/9"), underwriter)).andExpect(status().isOk());
    }

    @Test
    void markingReadChecksTheNotificationsOwner() throws Exception {
        when(notificationService.getById(5L)).thenReturn(notificationOf(9L));
        String id = OpaqueId.encode("ntf", 5L);
        mvc.perform(withAuth(put("/api/notifications/" + id + "/read"), customer8)).andExpect(status().isForbidden());
        verify(notificationService, org.mockito.Mockito.never()).markAsRead(any());
        mvc.perform(withAuth(put("/api/notifications/" + id + "/read"), underwriter)).andExpect(status().isOk());
        verify(notificationService).markAsRead(5L);
    }

    @Test
    void aMalformedOpaqueIdIs400WithTheWorkersMessage() throws Exception {
        mvc.perform(withAuth(put("/api/notifications/doc_1/read"), customer8))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Invalid id."))
                .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void anUnknownNotificationIs404() throws Exception {
        when(notificationService.getById(6L)).thenThrow(new com.digibank.notification.config.AppException("Notification not found.", 404));
        mvc.perform(withAuth(put("/api/notifications/" + OpaqueId.encode("ntf", 6L) + "/read"), customer8))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("Notification not found."));
    }

    @Test
    void seedWelcomePassesTheRequestedLanguageAndDefaultsToEnglish() throws Exception {
        mvc.perform(withAuth(post("/api/notifications/customer/8/seed-welcome").contentType(MediaType.APPLICATION_JSON).content("{\"lang\":\"he\"}"), customer8))
                .andExpect(status().isOk());
        verify(notificationService).seedWelcomeNotifications(8L, "he");
        mvc.perform(withAuth(post("/api/notifications/customer/8/seed-welcome"), customer8)).andExpect(status().isOk());
        verify(notificationService).seedWelcomeNotifications(8L, "en");
    }

    @Test
    void emailTemplateAdministrationIsForTheAdminRoleOnly() throws Exception {
        mvc.perform(withAuth(get("/api/auth/admin/email-templates"), customer8)).andExpect(status().isForbidden());
        mvc.perform(withAuth(get("/api/auth/admin/email-templates"), underwriter)).andExpect(status().isForbidden());
        mvc.perform(withAuth(get("/api/auth/admin/email-templates/events"), underwriter)).andExpect(status().isForbidden());
        mvc.perform(withAuth(put("/api/auth/admin/email-templates/SUBMITTED").contentType(MediaType.APPLICATION_JSON).content("{}"), underwriter))
                .andExpect(status().isForbidden());
        mvc.perform(withAuth(post("/api/auth/admin/email-templates/SUBMITTED/test").contentType(MediaType.APPLICATION_JSON).content("{}"), underwriter))
                .andExpect(status().isForbidden());
        mvc.perform(withAuth(get("/api/auth/admin/email-templates"), admin)).andExpect(status().isOk());
        verify(emailTemplateAdminService).getAllTemplates();
    }

    @Test
    void aTokenWithoutARoleIsNotAuthenticated() throws Exception {
        Date now = new Date();
        String noRole = Jwts.builder().setSubject("u").setIssuedAt(now).setExpiration(new Date(now.getTime() + 60_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes()), SignatureAlgorithm.HS256).compact();
        mvc.perform(withAuth(get("/api/notifications/customer/8"), noRole)).andExpect(status().isUnauthorized());
    }

    @Test
    void theTokenFilterIsRegisteredOnlyInsideTheSecurityChain() {
        assertThat(filterRegistration.isEnabled()).isFalse();
    }
}
