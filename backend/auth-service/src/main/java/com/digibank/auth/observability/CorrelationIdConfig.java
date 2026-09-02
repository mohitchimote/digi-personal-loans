package com.digibank.auth.observability;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/**
 * Registers CorrelationIdFilter at Ordered.HIGHEST_PRECEDENCE — must run before Spring Security's
 * filter chain (registered around SecurityProperties.DEFAULT_FILTER_ORDER) so even a 401/403
 * response carries a correlation ID, not just successful requests.
 */
@Configuration
public class CorrelationIdConfig {

    @Bean
    public FilterRegistrationBean<CorrelationIdFilter> correlationIdFilter() {
        FilterRegistrationBean<CorrelationIdFilter> registration = new FilterRegistrationBean<>(new CorrelationIdFilter());
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }
}
