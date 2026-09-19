package com.digibank.registry;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.server.EnableEurekaServer;

/**
 * Service discovery registry (ARCHITECTURE_REVIEW_GAPS.md, G3) — replaces api-gateway's hardcoded
 * localhost:8081-8086 routes and every inter-service RestTemplate's static URL with dynamic,
 * name-based lookup. Every other service in backend/ registers itself here on startup
 * (spring.application.name is the registered service ID) and api-gateway/application-service/
 * notification-service resolve each other through it instead of a fixed host:port.
 *
 * Not a peer-replicated Eureka cluster — a single instance is enough for this deployment's actual
 * scale (nine components, one region) and matches the project's existing bias toward the simplest
 * mechanism that solves the real problem (see the hand-rolled CircuitBreaker/SimpleCache instead of
 * Resilience4j/Redis). A production deployment on Kubernetes/ECS would likely rely on the
 * platform's own native service discovery instead of Eureka at all — this exists primarily so
 * local dev, Docker Compose, and any non-Kubernetes target still have a real answer.
 */
@SpringBootApplication
@EnableEurekaServer
public class ServiceRegistryApplication {
    public static void main(String[] args) {
        SpringApplication.run(ServiceRegistryApplication.class, args);
    }
}
