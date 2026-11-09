package com.digibank.auth.repository;

import com.digibank.auth.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
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

    long countByRole(String role);

    long countByOrgUnitId(Long orgUnitId);

    // A role's permissions travel in the token, so when a role is edited every session held by that
    // role is revoked: the next request forces a re-login that carries the new set.
    @Modifying
    @Transactional
    @Query("update User u set u.sessionsRevokedAt = :at where u.role = :role")
    int revokeSessionsForRole(@Param("role") String role, @Param("at") LocalDateTime at);
}
