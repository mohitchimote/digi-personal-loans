package com.digibank.integration.cardpayment;

import com.digibank.integration.cardpayment.dto.CardPaymentAuthoriseRequest;
import com.digibank.integration.cardpayment.dto.CardPaymentResult;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class CardPaymentGeneratorTest {

    private CardPaymentResult run(String ref) {
        CardPaymentAuthoriseRequest r = new CardPaymentAuthoriseRequest();
        r.setApplicationRef(ref);
        r.setAmount(new BigDecimal("250"));
        return new CardPaymentGenerator().authorise(r);
    }

    @Test
    void transactionIdFollowsTheWorkerFormat() {
        CardPaymentResult res = run("APP-2026-0001");
        assertTrue(res.getTransactionId().matches("TXN-APP20260001-\\d{6}"), res.getTransactionId());
        assertEquals("AUTHORISED", res.getStatus());
        assertTrue(res.getCardLast4().matches("\\d{4}"));
        assertTrue(res.getAuthorisationCode().matches("\\d{6}"));
        assertEquals("APP-2026-0001", res.getSeed());
    }

    @Test
    void sameApplicationGivesSameResult() {
        assertEquals(run("X1").getTransactionId(), run("X1").getTransactionId());
        assertEquals(run("X1").getCardLast4(), run("X1").getCardLast4());
    }
}
