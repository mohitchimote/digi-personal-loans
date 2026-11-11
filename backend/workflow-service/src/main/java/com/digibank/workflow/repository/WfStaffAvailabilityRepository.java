package com.digibank.workflow.repository;

import com.digibank.workflow.model.WfStaffAvailability;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface WfStaffAvailabilityRepository extends JpaRepository<WfStaffAvailability, Long> {
}
