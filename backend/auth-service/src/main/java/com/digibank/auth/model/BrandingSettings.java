package com.digibank.auth.model;

import jakarta.persistence.*;

@Entity
@Table(name = "branding_settings")
public class BrandingSettings {

    @Id
    private Long id = 1L;

    @Column(nullable = false)
    private String primaryColor = "#003366";

    @Column(nullable = false)
    private String accentColor = "#FBB034";

    private String logoUrl;

    public BrandingSettings() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPrimaryColor() { return primaryColor; }
    public void setPrimaryColor(String primaryColor) { this.primaryColor = primaryColor; }

    public String getAccentColor() { return accentColor; }
    public void setAccentColor(String accentColor) { this.accentColor = accentColor; }

    public String getLogoUrl() { return logoUrl; }
    public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }
}
