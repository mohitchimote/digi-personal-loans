package com.digibank.application.config;

import com.digibank.application.observability.CorrelationIdRequestInterceptor;
import org.springframework.boot.restclient.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class RestTemplateConfig {

    // The bare `new RestTemplate()` this replaces had no timeout at all — a hung
    // notification-service, document-service, or affordability-service call would block the
    // caller (often inside a @Transactional decisioning method, holding the DB transaction open)
    // indefinitely. Port of the same reasoning as worker/src/lib/resilience.ts's withTimeout, via
    // Spring's own RestTemplateBuilder rather than a hand-rolled wrapper.
    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder, CorrelationIdRequestInterceptor correlationIdRequestInterceptor) {
        return builder
                .connectTimeout(Duration.ofSeconds(3))
                .readTimeout(Duration.ofSeconds(8))
                .additionalInterceptors(correlationIdRequestInterceptor)
                .build();
    }
}
