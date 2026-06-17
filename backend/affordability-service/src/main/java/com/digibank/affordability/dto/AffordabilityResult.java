package com.digibank.affordability.dto;

import java.math.BigDecimal;
import java.util.List;

public class AffordabilityResult {
    private boolean passed;
    private BigDecimal dti;
    private BigDecimal hti;
    private BigDecimal disposableIncome;
    private BigDecimal monthlyRepaymentCapacity;
    private BigDecimal calculatedMonthlyRepayment;
    private List<String> failureReasons;
    private String riskCategory;
    private String creditScoreCategory;

    public boolean isPassed() { return passed; }
    public void setPassed(boolean passed) { this.passed = passed; }

    public BigDecimal getDti() { return dti; }
    public void setDti(BigDecimal dti) { this.dti = dti; }

    public BigDecimal getHti() { return hti; }
    public void setHti(BigDecimal hti) { this.hti = hti; }

    public BigDecimal getDisposableIncome() { return disposableIncome; }
    public void setDisposableIncome(BigDecimal disposableIncome) { this.disposableIncome = disposableIncome; }

    public BigDecimal getMonthlyRepaymentCapacity() { return monthlyRepaymentCapacity; }
    public void setMonthlyRepaymentCapacity(BigDecimal monthlyRepaymentCapacity) { this.monthlyRepaymentCapacity = monthlyRepaymentCapacity; }

    public BigDecimal getCalculatedMonthlyRepayment() { return calculatedMonthlyRepayment; }
    public void setCalculatedMonthlyRepayment(BigDecimal calculatedMonthlyRepayment) { this.calculatedMonthlyRepayment = calculatedMonthlyRepayment; }

    public List<String> getFailureReasons() { return failureReasons; }
    public void setFailureReasons(List<String> failureReasons) { this.failureReasons = failureReasons; }

    public String getRiskCategory() { return riskCategory; }
    public void setRiskCategory(String riskCategory) { this.riskCategory = riskCategory; }

    public String getCreditScoreCategory() { return creditScoreCategory; }
    public void setCreditScoreCategory(String creditScoreCategory) { this.creditScoreCategory = creditScoreCategory; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final AffordabilityResult obj = new AffordabilityResult();
        public Builder passed(boolean v) { obj.passed = v; return this; }
        public Builder dti(BigDecimal v) { obj.dti = v; return this; }
        public Builder hti(BigDecimal v) { obj.hti = v; return this; }
        public Builder disposableIncome(BigDecimal v) { obj.disposableIncome = v; return this; }
        public Builder monthlyRepaymentCapacity(BigDecimal v) { obj.monthlyRepaymentCapacity = v; return this; }
        public Builder calculatedMonthlyRepayment(BigDecimal v) { obj.calculatedMonthlyRepayment = v; return this; }
        public Builder failureReasons(List<String> v) { obj.failureReasons = v; return this; }
        public Builder riskCategory(String v) { obj.riskCategory = v; return this; }
        public Builder creditScoreCategory(String v) { obj.creditScoreCategory = v; return this; }
        public AffordabilityResult build() { return obj; }
    }
}
