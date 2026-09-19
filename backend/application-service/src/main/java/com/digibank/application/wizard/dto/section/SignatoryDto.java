package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public class SignatoryDto {

    @NotBlank(message = "fullName is required")
    private String fullName;

    @NotBlank(message = "nationalId is required")
    @Pattern(regexp = "\\d{9}", message = "nationalId must be 9 digits")
    private String nationalId;

    @NotBlank(message = "title is required")
    private String title;

    @NotNull(message = "ownershipPercentage is required")
    @DecimalMin(value = "0", message = "ownershipPercentage must be >= 0")
    @DecimalMax(value = "100", message = "ownershipPercentage must be <= 100")
    private Double ownershipPercentage;

    @NotNull(message = "primarySignatory is required")
    private Boolean primarySignatory;

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getNationalId() { return nationalId; }
    public void setNationalId(String nationalId) { this.nationalId = nationalId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public Double getOwnershipPercentage() { return ownershipPercentage; }
    public void setOwnershipPercentage(Double ownershipPercentage) { this.ownershipPercentage = ownershipPercentage; }
    public Boolean getPrimarySignatory() { return primarySignatory; }
    public void setPrimarySignatory(Boolean primarySignatory) { this.primarySignatory = primarySignatory; }
}
