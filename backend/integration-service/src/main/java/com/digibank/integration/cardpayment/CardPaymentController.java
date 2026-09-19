package com.digibank.integration.cardpayment;

import com.digibank.integration.cardpayment.dto.CardPaymentAuthoriseRequest;
import com.digibank.integration.cardpayment.dto.CardPaymentResult;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Internal-only contract (no api-gateway route) — application-service's
 * decisioning.IntegrationServiceCardPaymentAdapter (implements CardPaymentPort) calls this. Same
 * shape as businessfinancials.BusinessFinancialsController. POST + wrapper body throughout, not
 * GET (S9, ARCHITECTURE_REVIEW_GAPS.md). */
@RestController
@RequestMapping("/internal/integration/card-payment")
public class CardPaymentController {

    private final CardPaymentGenerator generator;

    public CardPaymentController(CardPaymentGenerator generator) {
        this.generator = generator;
    }

    @PostMapping("/authorise")
    public ResponseEntity<CardPaymentResult> authorise(@RequestBody CardPaymentAuthoriseRequest request) {
        return ResponseEntity.ok(generator.authorise(request));
    }
}
