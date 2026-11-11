package com.digibank.application.formbuilder;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FormVersionRepository extends JpaRepository<FormVersion, Long> {
    Optional<FormVersion> findFirstByFormKeyAndStatus(String formKey, String status);
    List<FormVersion> findByFormKeyOrderByVersionDesc(String formKey);
}
