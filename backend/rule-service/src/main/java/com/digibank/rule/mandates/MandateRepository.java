package com.digibank.rule.mandates;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MandateRepository extends JpaRepository<Mandate, Long> {
    List<Mandate> findByRoleCode(String roleCode);

    List<Mandate> findAllByOrderByRoleCodeAscIdAsc();
}
