package com.digibank.auth.security;

import com.digibank.auth.internal.InternalAccess;
import com.digibank.auth.internal.InternalKeyFilter;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final InternalKeyFilter internalKeyFilter;
    private final JsonAuthenticationEntryPoint authenticationEntryPoint;
    private final JsonAccessDeniedHandler accessDeniedHandler;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter, InternalKeyFilter internalKeyFilter,
                           JsonAuthenticationEntryPoint authenticationEntryPoint,
                           JsonAccessDeniedHandler accessDeniedHandler) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.internalKeyFilter = internalKeyFilter;
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
    }

    // Both filters are @Components, so Boot would also register each as a plain servlet filter outside the
    // security chain. They are once-per-request filters, so the outer copy would run first, and its
    // authentication can be discarded by the chain's own context handling. Disabling those registrations makes
    // each run exactly once, inside the chain, where it is meant to.
    @Bean
    public FilterRegistrationBean<JwtAuthenticationFilter> jwtFilterRegistration(JwtAuthenticationFilter filter) {
        FilterRegistrationBean<JwtAuthenticationFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<InternalKeyFilter> internalKeyFilterRegistration(InternalKeyFilter filter) {
        FilterRegistrationBean<InternalKeyFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .exceptionHandling(handler -> handler
                .authenticationEntryPoint(authenticationEntryPoint)
                .accessDeniedHandler(accessDeniedHandler))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/api/auth/register", "/api/auth/register/verify-otp", "/api/auth/register/resend-otp",
                        "/api/auth/login/request-otp", "/api/auth/login/verify-otp", "/api/auth/faqs").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/branding", "/api/branding/logo/**").permitAll()
                // Polled by the other 5 Java services' session-revocation cache (S2,
                // ARCHITECTURE_REVIEW_GAPS.md) — same internal-service-reachable pattern as
                // /api/branding above, no PII in the response (userId + timestamp pairs only).
                .requestMatchers(HttpMethod.GET, "/api/auth/revoked-since").permitAll()
                // Service-to-service reads (org units, role ladder, eligible staff). This path is under the
                // gateway's /api/auth route, so it must not be open: another service presenting X-Internal-Key,
                // or a signed-in staff member, and nobody else.
                .requestMatchers("/api/auth/internal/**")
                    .access((authentication, context) -> new AuthorizationDecision(InternalAccess.permits(authentication.get())))
                .requestMatchers("/api/auth/admin/**").hasRole("ADMIN")
                // The Worker gates both on the case.actAsCustomer entitlement, not on a role name.
                .requestMatchers("/api/auth/register-by-staff", "/api/auth/customer-profile/**")
                    .hasAuthority(JwtAuthenticationFilter.PERMISSION_PREFIX + "case.actAsCustomer")
                .anyRequest().authenticated()
            )
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(internalKeyFilter, JwtAuthenticationFilter.class);

        return http.build();
    }
}
