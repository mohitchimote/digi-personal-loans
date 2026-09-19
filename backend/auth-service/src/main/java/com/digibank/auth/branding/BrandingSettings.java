package com.digibank.auth.branding;

import jakarta.persistence.*;

@Entity
@Table(name = "branding_settings")
public class BrandingSettings {

    @Id
    private Long id = 1L;

    @Column(nullable = false)
    private String primaryColor = "#003366";

    // Q3 (ARCHITECTURE_REVIEW_GAPS.md) — worker/frontend already had this field end-to-end
    // (worker/src/db/schema.ts's brandingSettings.secondaryColor); Java was the one lagging.
    @Column(nullable = false)
    private String secondaryColor = "#002244";

    @Column(nullable = false)
    private String accentColor = "#FBB034";

    // Q3 — net-new on both sides. Null means "no gradient configured", falls back to a solid
    // primaryColor background (see BrandingService.applyTheme() on the frontend).
    private String gradientStart;
    private String gradientEnd;

    private String logoUrl;

    public BrandingSettings() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPrimaryColor() { return primaryColor; }
    public void setPrimaryColor(String primaryColor) { this.primaryColor = primaryColor; }

    public String getSecondaryColor() { return secondaryColor; }
    public void setSecondaryColor(String secondaryColor) { this.secondaryColor = secondaryColor; }

    public String getAccentColor() { return accentColor; }
    public void setAccentColor(String accentColor) { this.accentColor = accentColor; }

    public String getGradientStart() { return gradientStart; }
    public void setGradientStart(String gradientStart) { this.gradientStart = gradientStart; }

    public String getGradientEnd() { return gradientEnd; }
    public void setGradientEnd(String gradientEnd) { this.gradientEnd = gradientEnd; }

    public String getLogoUrl() { return logoUrl; }
    public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }
}
