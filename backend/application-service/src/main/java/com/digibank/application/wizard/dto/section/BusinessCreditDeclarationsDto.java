package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public class BusinessCreditDeclarationsDto {

    @NotNull(message = "hasLiquidationOrWindingUp is required")
    private Boolean hasLiquidationOrWindingUp;

    @NotNull(message = "hasCompanyDefaulted is required")
    private Boolean hasCompanyDefaulted;

    @NotNull(message = "hasCCJ is required")
    private Boolean hasCCJ;

    @NotNull(message = "directorCreditScore is required")
    @Min(value = 1, message = "directorCreditScore must be >= 1")
    @Max(value = 100, message = "directorCreditScore must be <= 100")
    private Integer directorCreditScore;

    public Boolean getHasLiquidationOrWindingUp() { return hasLiquidationOrWindingUp; }
    public void setHasLiquidationOrWindingUp(Boolean hasLiquidationOrWindingUp) { this.hasLiquidationOrWindingUp = hasLiquidationOrWindingUp; }
    public Boolean getHasCompanyDefaulted() { return hasCompanyDefaulted; }
    public void setHasCompanyDefaulted(Boolean hasCompanyDefaulted) { this.hasCompanyDefaulted = hasCompanyDefaulted; }
    public Boolean getHasCCJ() { return hasCCJ; }
    public void setHasCCJ(Boolean hasCCJ) { this.hasCCJ = hasCCJ; }
    public Integer getDirectorCreditScore() { return directorCreditScore; }
    public void setDirectorCreditScore(Integer directorCreditScore) { this.directorCreditScore = directorCreditScore; }
}
