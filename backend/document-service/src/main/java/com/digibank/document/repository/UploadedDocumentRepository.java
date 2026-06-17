package com.digibank.document.repository;

import com.digibank.document.model.UploadedDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface UploadedDocumentRepository extends JpaRepository<UploadedDocument, Long> {
    List<UploadedDocument> findByApplicationRefOrderByUploadedAtDesc(String applicationRef);
}
