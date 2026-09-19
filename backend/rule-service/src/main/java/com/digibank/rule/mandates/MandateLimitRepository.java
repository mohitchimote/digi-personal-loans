package com.digibank.rule.mandates;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MandateLimitRepository extends JpaRepository<MandateLimit, Long> {
    Optional<MandateLimit> findByRole(String role);
}
