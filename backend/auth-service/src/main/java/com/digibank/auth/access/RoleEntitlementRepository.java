package com.digibank.auth.access;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface RoleEntitlementRepository extends JpaRepository<RoleEntitlement, RoleEntitlement.Key> {
    List<RoleEntitlement> findByRoleCode(String roleCode);

    @Transactional
    void deleteByRoleCode(String roleCode);
}
