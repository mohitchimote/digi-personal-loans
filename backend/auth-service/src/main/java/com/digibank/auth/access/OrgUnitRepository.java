package com.digibank.auth.access;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrgUnitRepository extends JpaRepository<OrgUnit, Long> {
    boolean existsByCode(String code);
    List<OrgUnit> findByParentId(Long parentId);
    long countByLevelId(Long levelId);
}
