package com.digibank.workflow.repository;

import com.digibank.workflow.model.WfCommand;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface WfCommandRepository extends JpaRepository<WfCommand, String> {
}
