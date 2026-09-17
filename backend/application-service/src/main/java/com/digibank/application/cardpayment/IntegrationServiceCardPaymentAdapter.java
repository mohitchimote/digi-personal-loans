package com.digibank.application.cardpayment;

import com.digibank.application.cardpayment.dto.CardPaymentAuthoriseRequest;
import com.digibank.application.cardpayment.dto.CardPaymentResult;
import com.digibank.application.model.LoanApplication;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;

/**
 * Delegates to integration-service instead of running the simulation locally — same shape as
 * businessfinancials.IntegrationServiceBusinessFinancialsAdapter.
 */
@Component
public class IntegrationServiceCardPaymentAdapter implements CardPaymentPort {

    private final RestTemplate restTemplate;

    @Value("${app.integration-service.url}")
    private String integrationServiceUrl;

    public IntegrationServiceCardPaymentAdapter(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public CardPaymentResult authorise(LoanApplication app, BigDecimal amount) {
        CardPaymentAuthoriseRequest request = new CardPaymentAuthoriseRequest();
        request.setApplicationRef(app.getApplicationRef());
        request.setAmount(amount);

        return restTemplate.postForObject(
                integrationServiceUrl + "/internal/integration/card-payment/authorise",
                request, CardPaymentResult.class);
    }
}
