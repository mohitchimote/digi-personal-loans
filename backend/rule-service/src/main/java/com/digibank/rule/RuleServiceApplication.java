package com.digibank.rule;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * Lending-policy service (ARCHITECTURE_REVIEW_GAPS.md, G4/G6) — single source of truth for
 * mandate limits and affordability thresholds, extracted out of application-service's MandateRules
 * and affordability-service's AffordabilityRules in-memory beans, now backed by real persistence
 * (digibank_rules schema) instead of resetting to defaults on every restart.
 *
 * Internal only, per DigiLend_Production_Architecture.docx's service catalog: no api-gateway route
 * is registered for it, so it is reachable only service-to-service inside the compose/Eureka
 * network — deliberately has no Spring Security/JWT layer of its own, unlike every gateway-routed
 * service, since it is never handed a customer- or staff-facing token to validate.
 */
@SpringBootApplication
@EnableDiscoveryClient
public class RuleServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(RuleServiceApplication.class, args);
    }
}
