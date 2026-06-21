package com.digibank.affordability.dto;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public class BusinessAffordabilityRequest {

    @NotNull private BigDecimal annualTurnover;
    @NotNull private BigDecimal monthlyRevenue;

    private BigDecimal monthlyOutgoings = BigDecimal.ZERO;
    private BigDecimal existingBusinessDebtService = BigDecimal.ZERO;

    @NotNull private BigDecimal requestedLoanAmount;
    @NotNull private Integer requestedTermMonths;

    private Integer directorCreditScore = 7;
    private boolean hasCompanyDefaulted = false;
    private boolean hasLiquidationOrWindingUp = false;

    public BigDecimal getAnnualTurnover() { return annualTurnover; }
    public void setAnnualTurnover(BigDecimal annualTurnover) { this.annualTurnover = annualTurnover; }

    public BigDecimal getMonthlyRevenue() { return monthlyRevenue; }
    public void setMonthlyRevenue(BigDecimal monthlyRevenue) { this.monthlyRevenue = monthlyRevenue; }

    public BigDecimal getMonthlyOutgoings() { return monthlyOutgoings; }
    public void setMonthlyOutgoings(BigDecimal monthlyOutgoings) { this.monthlyOutgoings = monthlyOutgoings; }

    public BigDecimal getExistingBusinessDebtService() { return existingBusinessDebtService; }
    public void setExistingBusinessDebtService(BigDecimal existingBusinessDebtService) { this.existingBusinessDebtService = existingBusinessDebtService; }

    public BigDecimal getRequestedLoanAmount() { return requestedLoanAmount; }
    public void setRequestedLoanAmount(BigDecimal requestedLoanAmount) { this.requestedLoanAmount = requestedLoanAmount; }

    public Integer getRequestedTermMonths() { return requestedTermMonths; }
    public void setRequestedTermMonths(Integer requestedTermMonths) { this.requestedTermMonths = requestedTermMonths; }

    public Integer getDirectorCreditScore() { return directorCreditScore; }
    public void setDirectorCreditScore(Integer directorCreditScore) { this.directorCreditScore = directorCreditScore; }

    public boolean isHasCompanyDefaulted() { return hasCompanyDefaulted; }
    public void setHasCompanyDefaulted(boolean hasCompanyDefaulted) { this.hasCompanyDefaulted = hasCompanyDefaulted; }

    public boolean isHasLiquidationOrWindingUp() { return hasLiquidationOrWindingUp; }
    public void setHasLiquidationOrWindingUp(boolean hasLiquidationOrWindingUp) { this.hasLiquidationOrWindingUp = hasLiquidationOrWindingUp; }
}
