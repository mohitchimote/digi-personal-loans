package com.digibank.auth.branding;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface BrandingSettingsRepository extends JpaRepository<BrandingSettings, Long> {
}
