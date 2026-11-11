package com.digibank.workflow.repository;

import com.digibank.workflow.model.WfDefinition;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface WfDefinitionRepository extends JpaRepository<WfDefinition, Long> {
    List<WfDefinition> findByDefinitionKey(String definitionKey);

    List<WfDefinition> findByDefinitionKeyAndStatusOrderByVersionDesc(String definitionKey, String status);

    List<WfDefinition> findByStatusNot(String status);

    List<WfDefinition> findByDefinitionKeyAndStatusNotOrderByVersion(String definitionKey, String status);
}
