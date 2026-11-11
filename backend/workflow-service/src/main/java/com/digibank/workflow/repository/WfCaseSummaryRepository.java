package com.digibank.workflow.repository;

import com.digibank.workflow.model.WfCaseSummary;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Collection;

public interface WfCaseSummaryRepository extends JpaRepository<WfCaseSummary, String> {
    List<WfCaseSummary> findByStatusIn(Collection<String> statuses);
}
