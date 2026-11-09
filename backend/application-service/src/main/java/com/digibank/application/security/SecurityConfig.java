package com.digibank.application.security;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Staff endpoints are gated by what a person's role may do (an entitlement, carried in the token as a
 * PERM_ authority), not by role names, so a role an admin creates or edits works here without a code
 * change. The mapping is the one the default workflow definition makes (each action names the
 * entitlement it needs, each queue the one that opens it) and the Worker enforces: decline needs
 * case.decline, the pipeline needs queue.pipeline, and so on. Until the Java workflow engine exists
 * (milestone M3) the mapping is stated here.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final JsonAuthenticationEntryPoint authenticationEntryPoint;
    private final JsonAccessDeniedHandler accessDeniedHandler;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                           JsonAuthenticationEntryPoint authenticationEntryPoint,
                           JsonAccessDeniedHandler accessDeniedHandler) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
    }

    /** "case.decline" becomes the authority "PERM_case.decline". */
    static String perm(String entitlement) {
        return AuthenticatedUser.PERMISSION_PREFIX + entitlement;
    }

    /**
     * The token filter is a @Component, so Boot would also register it as a plain servlet filter, outside
     * the security chain. It is a once-per-request filter, so whichever copy ran first would win, and the
     * outer copy's authentication can be discarded by the chain's own context handling. Disabling that
     * registration makes it run exactly once, inside the chain, where it is meant to.
     */
    @Bean
    public FilterRegistrationBean<JwtAuthenticationFilter> jwtFilterRegistration(JwtAuthenticationFilter filter) {
        FilterRegistrationBean<JwtAuthenticationFilter> registration = new FilterRegistrationBean<>(filter);
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
                .requestMatchers(HttpMethod.PUT, "/api/applications/mandate-rules").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/applications/mandate-rules").hasAuthority(perm("mandates.view"))
                .requestMatchers(HttpMethod.PUT, "/api/applications/*/section-by-underwriter").hasAuthority(perm("case.editSection"))
                .requestMatchers(HttpMethod.GET, "/api/applications/pipeline").hasAuthority(perm("queue.pipeline"))
                .requestMatchers(HttpMethod.GET, "/api/applications/banker-queue").hasAuthority(perm("queue.banker"))
                .requestMatchers(HttpMethod.POST, "/api/applications/*/notes").hasAuthority(perm("case.addNote"))
                .requestMatchers(HttpMethod.POST, "/api/applications/*/decline").hasAuthority(perm("case.decline"))
                .requestMatchers(HttpMethod.POST, "/api/applications/*/send-back").hasAuthority(perm("case.sendBack"))
                // /approve is the conditional approval and /approve-by-underwriter the decision; both are
                // approvals. /approve was open to any signed-in user, customers included, until now.
                .requestMatchers(HttpMethod.POST, "/api/applications/*/approve", "/api/applications/*/approve-by-underwriter")
                    .hasAuthority(perm("case.approve"))
                .requestMatchers(HttpMethod.POST, "/api/applications/*/refer-to-senior").hasAuthority(perm("case.refer"))
                .requestMatchers(HttpMethod.POST, "/api/applications/*/disbursement/authorise").hasAuthority(perm("case.disburse"))
                .requestMatchers(HttpMethod.POST, "/api/applications/*/disbursement/second-check")
                    .hasAuthority(perm("case.disburseSecondCheck"))
                .requestMatchers(HttpMethod.POST, "/api/applications/*/data-verification/resolve")
                    .hasAuthority(perm("case.resolveVerification"))
                .anyRequest().authenticated()
            )
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
