package com.digibank.workflow.repository;

import com.digibank.workflow.model.WfTransition;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface WfTransitionRepository extends JpaRepository<WfTransition, Long> {
    List<WfTransition> findByApplicationRefOrderById(String applicationRef);
}
