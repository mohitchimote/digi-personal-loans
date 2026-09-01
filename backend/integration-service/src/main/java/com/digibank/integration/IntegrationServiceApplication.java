package com.digibank.integration;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * The single outbound boundary to the outside world (ARCHITECTURE_REVIEW_GAPS.md, G5) — OTP/SMS/
 * Email delivery, document/data verification (National ID + document OCR + credit-bureau
 * comparison), and business financials intelligence (Open Banking-style P&L/cashflow). Every
 * capability here is still simulated — no real provider is wired up (PRODUCTION_READINESS.md §7) —
 * but each one now sits behind a real internal REST call instead of a local method, so a real
 * provider integration later is a new implementation inside this service, not a rewrite of any of
 * its callers.
 *
 * Internal only, per DigiLend_Production_Architecture.docx's service catalog: no api-gateway route
 * is registered for it, and — like rule-service — it holds no state of its own (every generated
 * value is either stateless-per-request or persisted by the caller), so it needs no database and no
 * Spring Security/JWT layer; it is never handed a customer- or staff-facing token.
 */
@SpringBootApplication
@EnableDiscoveryClient
public class IntegrationServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(IntegrationServiceApplication.class, args);
    }
}
