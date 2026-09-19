package com.digibank.document.config;

import org.springframework.boot.restclient.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/**
 * This service made no outbound HTTP calls before S2 (ARCHITECTURE_REVIEW_GAPS.md) added
 * SessionRevocationCache's poll of auth-service. Same reasoning as application-service's
 * RestTemplateConfig: a bare `new RestTemplate()` has no timeout, so a hung auth-service call
 * would block the poller indefinitely.
 */
@Configuration
public class RestTemplateConfig {

    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
                .connectTimeout(Duration.ofSeconds(3))
                .readTimeout(Duration.ofSeconds(8))
                .build();
    }
}
