package com.digibank.auth.repository;

import com.digibank.auth.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
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
}
