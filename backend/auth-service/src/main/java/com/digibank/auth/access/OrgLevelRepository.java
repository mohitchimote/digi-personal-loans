package com.digibank.auth.access;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrgLevelRepository extends JpaRepository<OrgLevel, Long> {
    boolean existsByName(String name);
}
