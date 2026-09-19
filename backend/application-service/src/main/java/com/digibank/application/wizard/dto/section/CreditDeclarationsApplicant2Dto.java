package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public class CreditDeclarationsApplicant2Dto {

    @NotNull(message = "hasDefaulted is required")
    private Boolean hasDefaulted;

    @NotNull(message = "hasBankruptcy is required")
    private Boolean hasBankruptcy;

    @NotNull(message = "hasCCJ is required")
    private Boolean hasCCJ;

    @NotNull(message = "hasPaymentPlan is required")
    private Boolean hasPaymentPlan;

    @NotNull(message = "creditScore is required")
    @Min(value = 300, message = "creditScore must be >= 300")
    @Max(value = 850, message = "creditScore must be <= 850")
    private Integer creditScore;

    public Boolean getHasDefaulted() { return hasDefaulted; }
    public void setHasDefaulted(Boolean hasDefaulted) { this.hasDefaulted = hasDefaulted; }
    public Boolean getHasBankruptcy() { return hasBankruptcy; }
    public void setHasBankruptcy(Boolean hasBankruptcy) { this.hasBankruptcy = hasBankruptcy; }
    public Boolean getHasCCJ() { return hasCCJ; }
    public void setHasCCJ(Boolean hasCCJ) { this.hasCCJ = hasCCJ; }
    public Boolean getHasPaymentPlan() { return hasPaymentPlan; }
    public void setHasPaymentPlan(Boolean hasPaymentPlan) { this.hasPaymentPlan = hasPaymentPlan; }
    public Integer getCreditScore() { return creditScore; }
    public void setCreditScore(Integer creditScore) { this.creditScore = creditScore; }
}
