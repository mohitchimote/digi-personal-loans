package com.digibank.product.model;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "loan_products")
public class LoanProduct {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String productCode;

    @Column(nullable = false)
    private String productName;

    @Column(columnDefinition = "TEXT")
    private String description;

    private BigDecimal annualInterestRate;
    private BigDecimal minAmount;
    private BigDecimal maxAmount;
    private Integer minTermMonths;
    private Integer maxTermMonths;
    private Integer minCreditScore;
    private BigDecimal minMonthlyIncome;
    private BigDecimal maxDti;

    private String riskCategories;

    private boolean active = true;

    public LoanProduct() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getProductCode() { return productCode; }
    public void setProductCode(String productCode) { this.productCode = productCode; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public BigDecimal getAnnualInterestRate() { return annualInterestRate; }
    public void setAnnualInterestRate(BigDecimal annualInterestRate) { this.annualInterestRate = annualInterestRate; }

    public BigDecimal getMinAmount() { return minAmount; }
    public void setMinAmount(BigDecimal minAmount) { this.minAmount = minAmount; }

    public BigDecimal getMaxAmount() { return maxAmount; }
    public void setMaxAmount(BigDecimal maxAmount) { this.maxAmount = maxAmount; }

    public Integer getMinTermMonths() { return minTermMonths; }
    public void setMinTermMonths(Integer minTermMonths) { this.minTermMonths = minTermMonths; }

    public Integer getMaxTermMonths() { return maxTermMonths; }
    public void setMaxTermMonths(Integer maxTermMonths) { this.maxTermMonths = maxTermMonths; }

    public Integer getMinCreditScore() { return minCreditScore; }
    public void setMinCreditScore(Integer minCreditScore) { this.minCreditScore = minCreditScore; }

    public BigDecimal getMinMonthlyIncome() { return minMonthlyIncome; }
    public void setMinMonthlyIncome(BigDecimal minMonthlyIncome) { this.minMonthlyIncome = minMonthlyIncome; }

    public BigDecimal getMaxDti() { return maxDti; }
    public void setMaxDti(BigDecimal maxDti) { this.maxDti = maxDti; }

    public String getRiskCategories() { return riskCategories; }
    public void setRiskCategories(String riskCategories) { this.riskCategories = riskCategories; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final LoanProduct obj = new LoanProduct();
        public Builder productCode(String v) { obj.productCode = v; return this; }
        public Builder productName(String v) { obj.productName = v; return this; }
        public Builder description(String v) { obj.description = v; return this; }
        public Builder annualInterestRate(BigDecimal v) { obj.annualInterestRate = v; return this; }
        public Builder minAmount(BigDecimal v) { obj.minAmount = v; return this; }
        public Builder maxAmount(BigDecimal v) { obj.maxAmount = v; return this; }
        public Builder minTermMonths(Integer v) { obj.minTermMonths = v; return this; }
        public Builder maxTermMonths(Integer v) { obj.maxTermMonths = v; return this; }
        public Builder minCreditScore(Integer v) { obj.minCreditScore = v; return this; }
        public Builder minMonthlyIncome(BigDecimal v) { obj.minMonthlyIncome = v; return this; }
        public Builder maxDti(BigDecimal v) { obj.maxDti = v; return this; }
        public Builder riskCategories(String v) { obj.riskCategories = v; return this; }
        public Builder active(boolean v) { obj.active = v; return this; }
        public LoanProduct build() { return obj; }
    }
}
