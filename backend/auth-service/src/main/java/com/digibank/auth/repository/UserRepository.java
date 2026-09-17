package com.digibank.auth.repository;

import com.digibank.auth.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);
    Optional<User> findByNationalId(String nationalId);
    boolean existsByNationalId(String nationalId);
    Optional<User> findByUuid(String uuid);
    List<User> findByRoleIn(List<String> roles);
    // S2 (ARCHITECTURE_REVIEW_GAPS.md) — backs GET /api/auth/revoked-since, polled by every other
    // Java service (no Redis, no per-request inter-service call — see JwtAuthenticationFilter in
    // each of those services).
    List<User> findBySessionsRevokedAtAfter(LocalDateTime since);
}
