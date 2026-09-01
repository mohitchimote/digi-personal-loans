package com.digibank.auth.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/** Same reasoning as application-service's/affordability-service's RestTemplateConfig: a bare
 * `new RestTemplate()` has no timeout, so a hung integration-service call
 * (otpdelivery.IntegrationServiceOtpDeliveryAdapter) would block OTP issuance indefinitely. */
@Configuration
public class RestTemplateConfig {

    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
                .setConnectTimeout(Duration.ofSeconds(3))
                .setReadTimeout(Duration.ofSeconds(8))
                .build();
    }
}
