package com.digibank.application.repository;

import com.digibank.application.model.LoanApplication;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface LoanApplicationRepository extends JpaRepository<LoanApplication, Long> {
    Optional<LoanApplication> findByApplicationRef(String applicationRef);

    /** The case's row, locked until the surrounding transaction ends: concurrent workflow actions on one case queue up on it. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from LoanApplication a where a.applicationRef = :ref")
    Optional<LoanApplication> findForUpdateByApplicationRef(@Param("ref") String ref);
    List<LoanApplication> findByCustomerIdOrderByCreatedAtDesc(Long customerId);
    Optional<LoanApplication> findFirstByCustomerIdAndStatusInOrderByUpdatedAtDesc(
            Long customerId, List<String> statuses);
    Optional<LoanApplication> findFirstByCustomerIdOrderByUpdatedAtDesc(Long customerId);
    List<LoanApplication> findByStatusInOrderBySubmittedAtAsc(List<String> statuses);
    List<LoanApplication> findByStatusInOrderByUpdatedAtDesc(List<String> statuses);
    long countByOrgUnitId(Long orgUnitId);
}
