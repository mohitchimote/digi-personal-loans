package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public class BusinessFinancialsDto {

    @NotNull(message = "annualTurnover is required")
    @DecimalMin(value = "0", message = "annualTurnover must be >= 0")
    private Double annualTurnover;

    @NotNull(message = "monthlyRevenue is required")
    @DecimalMin(value = "0", message = "monthlyRevenue must be >= 0")
    private Double monthlyRevenue;

    @NotNull(message = "netProfitMargin is required")
    @DecimalMin(value = "0", message = "netProfitMargin must be >= 0")
    @DecimalMax(value = "100", message = "netProfitMargin must be <= 100")
    private Double netProfitMargin;

    @NotNull(message = "yearsTrading is required")
    @DecimalMin(value = "0", message = "yearsTrading must be >= 0")
    private Double yearsTrading;

    @NotNull(message = "employeeCount is required")
    @DecimalMin(value = "0", message = "employeeCount must be >= 0")
    private Integer employeeCount;

    public Double getAnnualTurnover() { return annualTurnover; }
    public void setAnnualTurnover(Double annualTurnover) { this.annualTurnover = annualTurnover; }
    public Double getMonthlyRevenue() { return monthlyRevenue; }
    public void setMonthlyRevenue(Double monthlyRevenue) { this.monthlyRevenue = monthlyRevenue; }
    public Double getNetProfitMargin() { return netProfitMargin; }
    public void setNetProfitMargin(Double netProfitMargin) { this.netProfitMargin = netProfitMargin; }
    public Double getYearsTrading() { return yearsTrading; }
    public void setYearsTrading(Double yearsTrading) { this.yearsTrading = yearsTrading; }
    public Integer getEmployeeCount() { return employeeCount; }
    public void setEmployeeCount(Integer employeeCount) { this.employeeCount = employeeCount; }
}
