package com.digibank.affordability;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableDiscoveryClient
@EnableScheduling // S2 — SessionRevocationCache's poll() (ARCHITECTURE_REVIEW_GAPS.md)
public class AffordabilityServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(AffordabilityServiceApplication.class, args);
    }
}
