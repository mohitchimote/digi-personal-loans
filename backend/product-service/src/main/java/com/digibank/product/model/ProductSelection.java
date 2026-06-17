package com.digibank.product.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "product_selections")
public class ProductSelection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String applicationRef;

    private String productCode;
    private String productName;
    private Integer termMonths;
    private BigDecimal monthlyRepayment;
    private BigDecimal totalRepayable;
    private BigDecimal apr;

    private LocalDateTime selectedAt;

    @PrePersist
    protected void onCreate() {
        selectedAt = LocalDateTime.now();
    }

    public ProductSelection() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getApplicationRef() { return applicationRef; }
    public void setApplicationRef(String applicationRef) { this.applicationRef = applicationRef; }

    public String getProductCode() { return productCode; }
    public void setProductCode(String productCode) { this.productCode = productCode; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public Integer getTermMonths() { return termMonths; }
    public void setTermMonths(Integer termMonths) { this.termMonths = termMonths; }

    public BigDecimal getMonthlyRepayment() { return monthlyRepayment; }
    public void setMonthlyRepayment(BigDecimal monthlyRepayment) { this.monthlyRepayment = monthlyRepayment; }

    public BigDecimal getTotalRepayable() { return totalRepayable; }
    public void setTotalRepayable(BigDecimal totalRepayable) { this.totalRepayable = totalRepayable; }

    public BigDecimal getApr() { return apr; }
    public void setApr(BigDecimal apr) { this.apr = apr; }

    public LocalDateTime getSelectedAt() { return selectedAt; }
    public void setSelectedAt(LocalDateTime selectedAt) { this.selectedAt = selectedAt; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final ProductSelection obj = new ProductSelection();
        public Builder applicationRef(String v) { obj.applicationRef = v; return this; }
        public Builder productCode(String v) { obj.productCode = v; return this; }
        public Builder productName(String v) { obj.productName = v; return this; }
        public Builder termMonths(Integer v) { obj.termMonths = v; return this; }
        public Builder monthlyRepayment(BigDecimal v) { obj.monthlyRepayment = v; return this; }
        public Builder totalRepayable(BigDecimal v) { obj.totalRepayable = v; return this; }
        public Builder apr(BigDecimal v) { obj.apr = v; return this; }
        public ProductSelection build() { return obj; }
    }
}
