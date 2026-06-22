package com.digibank.application.repository;

import com.digibank.application.model.LoanApplication;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface LoanApplicationRepository extends JpaRepository<LoanApplication, Long> {
    Optional<LoanApplication> findByApplicationRef(String applicationRef);
    List<LoanApplication> findByCustomerIdOrderByCreatedAtDesc(Long customerId);
    Optional<LoanApplication> findFirstByCustomerIdAndStatusInOrderByUpdatedAtDesc(
            Long customerId, List<String> statuses);
    Optional<LoanApplication> findFirstByCustomerIdOrderByUpdatedAtDesc(Long customerId);
    List<LoanApplication> findByStatusInOrderBySubmittedAtAsc(List<String> statuses);
    List<LoanApplication> findByStatusInOrderByUpdatedAtDesc(List<String> statuses);
}
