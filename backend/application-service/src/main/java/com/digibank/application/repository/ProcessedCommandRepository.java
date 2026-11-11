package com.digibank.application.repository;

import com.digibank.application.model.ProcessedCommand;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProcessedCommandRepository extends JpaRepository<ProcessedCommand, String> {
}
