package com.digibank.application.repository;

import com.digibank.application.model.CaseReferral;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CaseReferralRepository extends JpaRepository<CaseReferral, Long> {
    List<CaseReferral> findByApplicationRefOrderByCreatedAtAsc(String applicationRef);
    List<CaseReferral> findByApplicationRefAndResolvedAtIsNull(String applicationRef);
}
