package com.digibank.workflow.repository;

import com.digibank.workflow.model.WfReferral;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface WfReferralRepository extends JpaRepository<WfReferral, Long> {
    List<WfReferral> findByApplicationRefAndResolvedAtIsNull(String applicationRef);

    List<WfReferral> findByApplicationRefOrderById(String applicationRef);
}
