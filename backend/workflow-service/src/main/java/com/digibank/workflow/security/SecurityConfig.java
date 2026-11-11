package com.digibank.workflow.security;

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
 * Access is decided by what a person's role may do (an entitlement, carried in the token as a PERM_ authority), never by role
 * names. The admin builder API is ADMIN only, as in the Worker. Assigning a case needs case.assign; every other runtime route
 * needs a signed-in caller and the services apply the finer rules (staff only, case scope, ownership). /internal/** is the
 * service-to-service API: no gateway route exists for it, and like the other internal endpoints it takes no token.
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

    /** "case.assign" becomes the authority "PERM_case.assign". */
    static String perm(String entitlement) {
        return AuthenticatedUser.PERMISSION_PREFIX + entitlement;
    }

    /**
     * The token filter is a @Component, so Boot would also register it as a plain servlet filter, outside the security chain.
     * It is a once-per-request filter, so whichever copy ran first would win, and the outer copy's authentication can be
     * discarded by the chain's own context handling. Disabling that registration makes it run exactly once, inside the chain.
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
                .requestMatchers("/internal/**").permitAll()
                .requestMatchers("/api/auth/admin/workflow/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/workflow/cases/*/eligible").hasAuthority(perm("case.assign"))
                .requestMatchers(HttpMethod.POST, "/api/workflow/cases/*/assign").hasAuthority(perm("case.assign"))
                .anyRequest().authenticated()
            )
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
