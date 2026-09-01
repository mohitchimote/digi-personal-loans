package com.digibank.document.storage;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface UploadedDocumentRepository extends JpaRepository<UploadedDocument, Long> {
    List<UploadedDocument> findByApplicationRefOrderByUploadedAtDesc(String applicationRef);
}
