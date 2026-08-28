package com.digibank.application.security;

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
 * Role gating here mirrors worker/src/routes/applications.ts's assertRole(...STAFF_ROLES) /
 * assertRole(c, "ADMIN") calls exactly (see PRODUCTION_READINESS.md §5/§6) — this is a faithful
 * port of the already-shipped-and-battle-tested Worker fix, not a fresh design.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final String[] STAFF_ROLES = {
            "BANKER", "UNDERWRITER", "SENIOR_UNDERWRITER", "HEAD_OF_LENDING", "COO", "CEO", "ADMIN"
    };

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

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .exceptionHandling(handler -> handler
                .authenticationEntryPoint(authenticationEntryPoint)
                .accessDeniedHandler(accessDeniedHandler))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers(HttpMethod.PUT, "/api/applications/mandate-rules").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/applications/mandate-rules").hasAnyRole(STAFF_ROLES)
                .requestMatchers(HttpMethod.PUT, "/api/applications/*/section-by-underwriter").hasAnyRole(STAFF_ROLES)
                .requestMatchers(HttpMethod.GET, "/api/applications/pipeline", "/api/applications/banker-queue")
                    .hasAnyRole(STAFF_ROLES)
                .requestMatchers(HttpMethod.POST,
                        "/api/applications/*/notes",
                        "/api/applications/*/decline",
                        "/api/applications/*/send-back",
                        "/api/applications/*/approve-by-underwriter",
                        "/api/applications/*/refer-to-senior",
                        "/api/applications/*/disbursement/authorise",
                        "/api/applications/*/disbursement/second-check",
                        "/api/applications/*/data-verification/resolve")
                    .hasAnyRole(STAFF_ROLES)
                .anyRequest().authenticated()
            )
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
