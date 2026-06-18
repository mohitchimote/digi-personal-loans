package com.digibank.auth.repository;

import com.digibank.auth.model.BrandingSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface BrandingSettingsRepository extends JpaRepository<BrandingSettings, Long> {
}
