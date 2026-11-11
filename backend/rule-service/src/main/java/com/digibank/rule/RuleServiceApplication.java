package com.digibank.rule;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Lending-policy service (ARCHITECTURE_REVIEW_GAPS.md, G4/G6) — single source of truth for
 * approval mandates (the Worker's context mandates: by role, org unit and application type) and
 * affordability thresholds, with real persistence (digibank_rules schema).
 *
 * Everything under /internal is service-to-service: no api-gateway route reaches it, so it is open inside the
 * compose/Eureka network, as before. The one gateway-routed part is the mandate admin API at the Worker's
 * /api/auth/admin/mandates path, which needs an ADMIN token (see SecurityConfig).
 */
@SpringBootApplication
@EnableDiscoveryClient
@EnableScheduling // SessionRevocationCache polls auth-service for revoked sessions
public class RuleServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(RuleServiceApplication.class, args);
    }
}
