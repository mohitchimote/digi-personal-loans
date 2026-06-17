package com.digibank.document.repository;

import com.digibank.document.model.GeneratedDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface GeneratedDocumentRepository extends JpaRepository<GeneratedDocument, Long> {
    List<GeneratedDocument> findByCustomerIdOrderByGeneratedAtDesc(Long customerId);
    List<GeneratedDocument> findByApplicationRefOrderByGeneratedAtDesc(String applicationRef);
}
