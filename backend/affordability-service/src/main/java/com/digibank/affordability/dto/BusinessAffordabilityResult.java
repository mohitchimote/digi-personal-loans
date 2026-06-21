package com.digibank.affordability.dto;

import java.math.BigDecimal;
import java.util.List;

/** Business-loan equivalent of AffordabilityResult — DSCR (Debt Service Coverage Ratio) replaces
 * DTI/HTI since a company's repayment capacity is assessed against operating income, not salary. */
public class BusinessAffordabilityResult {
    private boolean passed;
    private BigDecimal dscr;
    private BigDecimal monthlyNetOperatingIncome;
    private BigDecimal monthlyRepaymentCapacity;
    private BigDecimal calculatedMonthlyRepayment;
    private List<String> failureReasons;
    private String riskCategory;
    private String creditScoreCategory;

    public boolean isPassed() { return passed; }
    public void setPassed(boolean passed) { this.passed = passed; }

    public BigDecimal getDscr() { return dscr; }
    public void setDscr(BigDecimal dscr) { this.dscr = dscr; }

    public BigDecimal getMonthlyNetOperatingIncome() { return monthlyNetOperatingIncome; }
    public void setMonthlyNetOperatingIncome(BigDecimal monthlyNetOperatingIncome) { this.monthlyNetOperatingIncome = monthlyNetOperatingIncome; }

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
        private final BusinessAffordabilityResult obj = new BusinessAffordabilityResult();
        public Builder passed(boolean v) { obj.passed = v; return this; }
        public Builder dscr(BigDecimal v) { obj.dscr = v; return this; }
        public Builder monthlyNetOperatingIncome(BigDecimal v) { obj.monthlyNetOperatingIncome = v; return this; }
        public Builder monthlyRepaymentCapacity(BigDecimal v) { obj.monthlyRepaymentCapacity = v; return this; }
        public Builder calculatedMonthlyRepayment(BigDecimal v) { obj.calculatedMonthlyRepayment = v; return this; }
        public Builder failureReasons(List<String> v) { obj.failureReasons = v; return this; }
        public Builder riskCategory(String v) { obj.riskCategory = v; return this; }
        public Builder creditScoreCategory(String v) { obj.creditScoreCategory = v; return this; }
        public BusinessAffordabilityResult build() { return obj; }
    }
}
