package com.digibank.affordability.dto;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public class AffordabilityRequest {

    @NotNull private BigDecimal monthlyGrossIncome;
    @NotNull private BigDecimal monthlyNetIncome;

    private BigDecimal monthlyRent = BigDecimal.ZERO;
    private BigDecimal monthlyMortgage = BigDecimal.ZERO;
    private BigDecimal monthlyLoans = BigDecimal.ZERO;
    private BigDecimal creditCardPayments = BigDecimal.ZERO;
    private BigDecimal otherMonthlyCommitments = BigDecimal.ZERO;
    private BigDecimal monthlyLivingExpenses = BigDecimal.ZERO;

    @NotNull private BigDecimal requestedLoanAmount;
    @NotNull private Integer requestedTermMonths;

    private Integer creditScore = 700;
    private boolean hasDefaulted = false;
    private boolean hasBankruptcy = false;

    public BigDecimal getMonthlyGrossIncome() { return monthlyGrossIncome; }
    public void setMonthlyGrossIncome(BigDecimal monthlyGrossIncome) { this.monthlyGrossIncome = monthlyGrossIncome; }

    public BigDecimal getMonthlyNetIncome() { return monthlyNetIncome; }
    public void setMonthlyNetIncome(BigDecimal monthlyNetIncome) { this.monthlyNetIncome = monthlyNetIncome; }

    public BigDecimal getMonthlyRent() { return monthlyRent; }
    public void setMonthlyRent(BigDecimal monthlyRent) { this.monthlyRent = monthlyRent; }

    public BigDecimal getMonthlyMortgage() { return monthlyMortgage; }
    public void setMonthlyMortgage(BigDecimal monthlyMortgage) { this.monthlyMortgage = monthlyMortgage; }

    public BigDecimal getMonthlyLoans() { return monthlyLoans; }
    public void setMonthlyLoans(BigDecimal monthlyLoans) { this.monthlyLoans = monthlyLoans; }

    public BigDecimal getCreditCardPayments() { return creditCardPayments; }
    public void setCreditCardPayments(BigDecimal creditCardPayments) { this.creditCardPayments = creditCardPayments; }

    public BigDecimal getOtherMonthlyCommitments() { return otherMonthlyCommitments; }
    public void setOtherMonthlyCommitments(BigDecimal otherMonthlyCommitments) { this.otherMonthlyCommitments = otherMonthlyCommitments; }

    public BigDecimal getMonthlyLivingExpenses() { return monthlyLivingExpenses; }
    public void setMonthlyLivingExpenses(BigDecimal monthlyLivingExpenses) { this.monthlyLivingExpenses = monthlyLivingExpenses; }

    public BigDecimal getRequestedLoanAmount() { return requestedLoanAmount; }
    public void setRequestedLoanAmount(BigDecimal requestedLoanAmount) { this.requestedLoanAmount = requestedLoanAmount; }

    public Integer getRequestedTermMonths() { return requestedTermMonths; }
    public void setRequestedTermMonths(Integer requestedTermMonths) { this.requestedTermMonths = requestedTermMonths; }

    public Integer getCreditScore() { return creditScore; }
    public void setCreditScore(Integer creditScore) { this.creditScore = creditScore; }

    public boolean isHasDefaulted() { return hasDefaulted; }
    public void setHasDefaulted(boolean hasDefaulted) { this.hasDefaulted = hasDefaulted; }

    public boolean isHasBankruptcy() { return hasBankruptcy; }
    public void setHasBankruptcy(boolean hasBankruptcy) { this.hasBankruptcy = hasBankruptcy; }
}
