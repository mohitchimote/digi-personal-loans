package com.digibank.notification.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class RestTemplateConfig {

    // The bare `new RestTemplate()` this replaces had no timeout at all — affects both the
    // BrandingClient call to auth-service and, more importantly, ResendClient's call to the
    // outside world. Port of the same reasoning as worker/src/lib/resilience.ts's withTimeout.
    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
                .setConnectTimeout(Duration.ofSeconds(3))
                .setReadTimeout(Duration.ofSeconds(8))
                .build();
    }
}
