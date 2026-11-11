package com.digibank.workflow.repository;

import com.digibank.workflow.model.WfCase;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.Optional;

public interface WfCaseRepository extends JpaRepository<WfCase, Long> {
    Optional<WfCase> findByApplicationRef(String applicationRef);

    List<WfCase> findByApplicationRefIn(Collection<String> refs);

    /** Serialises concurrent actions on one case: the row is locked until the transaction ends. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from WfCase c where c.applicationRef = :ref")
    Optional<WfCase> lockByApplicationRef(@Param("ref") String ref);

    @Query("select c.definitionId, count(c) from WfCase c group by c.definitionId")
    List<Object[]> countByDefinition();
}
