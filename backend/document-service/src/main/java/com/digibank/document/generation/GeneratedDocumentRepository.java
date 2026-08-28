package com.digibank.document.generation;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface GeneratedDocumentRepository extends JpaRepository<GeneratedDocument, Long> {
    List<GeneratedDocument> findByCustomerIdOrderByGeneratedAtDesc(Long customerId);
    List<GeneratedDocument> findByApplicationRefOrderByGeneratedAtDesc(String applicationRef);
}
