package com.digibank.product.dto;

import java.math.BigDecimal;

public class EligibleProduct {
    private String productId;
    private String productName;
    private String description;
    private BigDecimal interestRate;
    private BigDecimal minAmount;
    private BigDecimal maxAmount;
    private Integer minTermMonths;
    private Integer maxTermMonths;
    private BigDecimal monthlyRepayment;
    private BigDecimal totalRepayable;
    private BigDecimal apr;
    private boolean recommended;
    private String badge;

    public String getProductId() { return productId; }
    public void setProductId(String productId) { this.productId = productId; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public BigDecimal getInterestRate() { return interestRate; }
    public void setInterestRate(BigDecimal interestRate) { this.interestRate = interestRate; }

    public BigDecimal getMinAmount() { return minAmount; }
    public void setMinAmount(BigDecimal minAmount) { this.minAmount = minAmount; }

    public BigDecimal getMaxAmount() { return maxAmount; }
    public void setMaxAmount(BigDecimal maxAmount) { this.maxAmount = maxAmount; }

    public Integer getMinTermMonths() { return minTermMonths; }
    public void setMinTermMonths(Integer minTermMonths) { this.minTermMonths = minTermMonths; }

    public Integer getMaxTermMonths() { return maxTermMonths; }
    public void setMaxTermMonths(Integer maxTermMonths) { this.maxTermMonths = maxTermMonths; }

    public BigDecimal getMonthlyRepayment() { return monthlyRepayment; }
    public void setMonthlyRepayment(BigDecimal monthlyRepayment) { this.monthlyRepayment = monthlyRepayment; }

    public BigDecimal getTotalRepayable() { return totalRepayable; }
    public void setTotalRepayable(BigDecimal totalRepayable) { this.totalRepayable = totalRepayable; }

    public BigDecimal getApr() { return apr; }
    public void setApr(BigDecimal apr) { this.apr = apr; }

    public boolean isRecommended() { return recommended; }
    public void setRecommended(boolean recommended) { this.recommended = recommended; }

    public String getBadge() { return badge; }
    public void setBadge(String badge) { this.badge = badge; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final EligibleProduct obj = new EligibleProduct();
        public Builder productId(String v) { obj.productId = v; return this; }
        public Builder productName(String v) { obj.productName = v; return this; }
        public Builder description(String v) { obj.description = v; return this; }
        public Builder interestRate(BigDecimal v) { obj.interestRate = v; return this; }
        public Builder minAmount(BigDecimal v) { obj.minAmount = v; return this; }
        public Builder maxAmount(BigDecimal v) { obj.maxAmount = v; return this; }
        public Builder minTermMonths(Integer v) { obj.minTermMonths = v; return this; }
        public Builder maxTermMonths(Integer v) { obj.maxTermMonths = v; return this; }
        public Builder monthlyRepayment(BigDecimal v) { obj.monthlyRepayment = v; return this; }
        public Builder totalRepayable(BigDecimal v) { obj.totalRepayable = v; return this; }
        public Builder apr(BigDecimal v) { obj.apr = v; return this; }
        public Builder recommended(boolean v) { obj.recommended = v; return this; }
        public Builder badge(String v) { obj.badge = v; return this; }
        public EligibleProduct build() { return obj; }
    }
}
