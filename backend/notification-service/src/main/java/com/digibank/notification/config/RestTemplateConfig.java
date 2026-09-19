package com.digibank.notification.config;

import com.digibank.notification.observability.CorrelationIdRequestInterceptor;
import org.springframework.boot.restclient.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class RestTemplateConfig {

    // The bare `new RestTemplate()` this replaces had no timeout at all — affects both the
    // BrandingClient call to auth-service and, more importantly, ResendClient's call to the
    // outside world. Port of the same reasoning as worker/src/lib/resilience.ts's withTimeout.
    // The correlation-ID interceptor below adds one extra header on the ResendClient path too —
    // harmless to an external API (an unrecognized header is simply ignored), and keeping one
    // RestTemplate bean here matches the rest of this service rather than splitting internal vs.
    // external clients over a concern this minor.
    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder, CorrelationIdRequestInterceptor correlationIdRequestInterceptor) {
        return builder
                .connectTimeout(Duration.ofSeconds(3))
                .readTimeout(Duration.ofSeconds(8))
                .additionalInterceptors(correlationIdRequestInterceptor)
                .build();
    }
}
