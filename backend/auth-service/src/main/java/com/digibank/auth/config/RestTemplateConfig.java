package com.digibank.auth.config;

import com.digibank.auth.observability.CorrelationIdRequestInterceptor;
import org.springframework.boot.restclient.RestTemplateBuilder;
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
    public RestTemplate restTemplate(RestTemplateBuilder builder, CorrelationIdRequestInterceptor correlationIdRequestInterceptor) {
        return builder
                .connectTimeout(Duration.ofSeconds(3))
                .readTimeout(Duration.ofSeconds(8))
                .additionalInterceptors(correlationIdRequestInterceptor)
                .build();
    }
}
