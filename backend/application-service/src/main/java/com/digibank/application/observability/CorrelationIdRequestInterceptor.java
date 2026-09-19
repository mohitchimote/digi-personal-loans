package com.digibank.application.observability;

import org.slf4j.MDC;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Forwards the current request's correlation ID (CorrelationIdFilter, MDC) onto every outbound
 * internal RestTemplate call, so the ID survives a gateway -> service -> service hop rather than
 * resetting at each boundary (S4, ARCHITECTURE_REVIEW_GAPS.md).
 */
@Component
public class CorrelationIdRequestInterceptor implements ClientHttpRequestInterceptor {

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution) throws IOException {
        String correlationId = MDC.get(CorrelationIdFilter.MDC_KEY);
        if (correlationId != null) {
            request.getHeaders().add(CorrelationIdFilter.HEADER, correlationId);
        }
        return execution.execute(request, body);
    }
}
