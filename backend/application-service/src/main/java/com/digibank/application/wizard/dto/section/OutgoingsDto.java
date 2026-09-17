package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public class OutgoingsDto {

    @NotNull(message = "monthlyRent is required")
    @DecimalMin(value = "0", message = "monthlyRent must be >= 0")
    private Double monthlyRent;

    @NotNull(message = "monthlyMortgage is required")
    @DecimalMin(value = "0", message = "monthlyMortgage must be >= 0")
    private Double monthlyMortgage;

    @NotNull(message = "monthlyLoans is required")
    @DecimalMin(value = "0", message = "monthlyLoans must be >= 0")
    private Double monthlyLoans;

    @NotNull(message = "creditCardPayments is required")
    @DecimalMin(value = "0", message = "creditCardPayments must be >= 0")
    private Double creditCardPayments;

    @NotNull(message = "otherMonthlyCommitments is required")
    @DecimalMin(value = "0", message = "otherMonthlyCommitments must be >= 0")
    private Double otherMonthlyCommitments;

    @DecimalMin(value = "0", message = "monthlyLivingExpenses must be >= 0")
    private Double monthlyLivingExpenses;

    public Double getMonthlyRent() { return monthlyRent; }
    public void setMonthlyRent(Double monthlyRent) { this.monthlyRent = monthlyRent; }
    public Double getMonthlyMortgage() { return monthlyMortgage; }
    public void setMonthlyMortgage(Double monthlyMortgage) { this.monthlyMortgage = monthlyMortgage; }
    public Double getMonthlyLoans() { return monthlyLoans; }
    public void setMonthlyLoans(Double monthlyLoans) { this.monthlyLoans = monthlyLoans; }
    public Double getCreditCardPayments() { return creditCardPayments; }
    public void setCreditCardPayments(Double creditCardPayments) { this.creditCardPayments = creditCardPayments; }
    public Double getOtherMonthlyCommitments() { return otherMonthlyCommitments; }
    public void setOtherMonthlyCommitments(Double otherMonthlyCommitments) { this.otherMonthlyCommitments = otherMonthlyCommitments; }
    public Double getMonthlyLivingExpenses() { return monthlyLivingExpenses; }
    public void setMonthlyLivingExpenses(Double monthlyLivingExpenses) { this.monthlyLivingExpenses = monthlyLivingExpenses; }
}
