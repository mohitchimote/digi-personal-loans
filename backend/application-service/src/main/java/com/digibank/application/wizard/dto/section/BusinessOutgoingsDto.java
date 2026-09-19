package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public class BusinessOutgoingsDto {

    @NotNull(message = "existingBusinessDebtService is required")
    @DecimalMin(value = "0", message = "existingBusinessDebtService must be >= 0")
    private Double existingBusinessDebtService;

    @NotNull(message = "monthlyLeaseRent is required")
    @DecimalMin(value = "0", message = "monthlyLeaseRent must be >= 0")
    private Double monthlyLeaseRent;

    @NotNull(message = "monthlyPayroll is required")
    @DecimalMin(value = "0", message = "monthlyPayroll must be >= 0")
    private Double monthlyPayroll;

    @NotNull(message = "monthlySupplierPayments is required")
    @DecimalMin(value = "0", message = "monthlySupplierPayments must be >= 0")
    private Double monthlySupplierPayments;

    public Double getExistingBusinessDebtService() { return existingBusinessDebtService; }
    public void setExistingBusinessDebtService(Double existingBusinessDebtService) { this.existingBusinessDebtService = existingBusinessDebtService; }
    public Double getMonthlyLeaseRent() { return monthlyLeaseRent; }
    public void setMonthlyLeaseRent(Double monthlyLeaseRent) { this.monthlyLeaseRent = monthlyLeaseRent; }
    public Double getMonthlyPayroll() { return monthlyPayroll; }
    public void setMonthlyPayroll(Double monthlyPayroll) { this.monthlyPayroll = monthlyPayroll; }
    public Double getMonthlySupplierPayments() { return monthlySupplierPayments; }
    public void setMonthlySupplierPayments(Double monthlySupplierPayments) { this.monthlySupplierPayments = monthlySupplierPayments; }
}
