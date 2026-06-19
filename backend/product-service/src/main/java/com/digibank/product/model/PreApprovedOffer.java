package com.digibank.product.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "pre_approved_offers")
public class PreApprovedOffer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nationalId;

    private String productCode;
    private String productName;
    private BigDecimal annualInterestRate;
    private BigDecimal amount;
    private Integer termMonths;
    private BigDecimal monthlyRepayment;
    private BigDecimal totalRepayable;

    private boolean consumed = false;
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() { createdAt = LocalDateTime.now(); }

    public PreApprovedOffer() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNationalId() { return nationalId; }
    public void setNationalId(String nationalId) { this.nationalId = nationalId; }
    public String getProductCode() { return productCode; }
    public void setProductCode(String productCode) { this.productCode = productCode; }
    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }
    public BigDecimal getAnnualInterestRate() { return annualInterestRate; }
    public void setAnnualInterestRate(BigDecimal annualInterestRate) { this.annualInterestRate = annualInterestRate; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public Integer getTermMonths() { return termMonths; }
    public void setTermMonths(Integer termMonths) { this.termMonths = termMonths; }
    public BigDecimal getMonthlyRepayment() { return monthlyRepayment; }
    public void setMonthlyRepayment(BigDecimal monthlyRepayment) { this.monthlyRepayment = monthlyRepayment; }
    public BigDecimal getTotalRepayable() { return totalRepayable; }
    public void setTotalRepayable(BigDecimal totalRepayable) { this.totalRepayable = totalRepayable; }
    public boolean isConsumed() { return consumed; }
    public void setConsumed(boolean consumed) { this.consumed = consumed; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final PreApprovedOffer obj = new PreApprovedOffer();
        public Builder nationalId(String v) { obj.nationalId = v; return this; }
        public Builder productCode(String v) { obj.productCode = v; return this; }
        public Builder productName(String v) { obj.productName = v; return this; }
        public Builder annualInterestRate(BigDecimal v) { obj.annualInterestRate = v; return this; }
        public Builder amount(BigDecimal v) { obj.amount = v; return this; }
        public Builder termMonths(Integer v) { obj.termMonths = v; return this; }
        public Builder monthlyRepayment(BigDecimal v) { obj.monthlyRepayment = v; return this; }
        public Builder totalRepayable(BigDecimal v) { obj.totalRepayable = v; return this; }
        public PreApprovedOffer build() { return obj; }
    }
}
