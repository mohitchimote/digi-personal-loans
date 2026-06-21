package com.digibank.product.dto;

import java.math.BigDecimal;

public class ProductEligibilityRequest {
    private String applicationRef;
    private BigDecimal monthlyGrossIncome;
    private Integer creditScore;
    private String riskCategory;
    private BigDecimal requestedAmount;
    private Integer requestedTermMonths;
    private BigDecimal dti;
    private String productType = "PERSONAL";

    public String getApplicationRef() { return applicationRef; }
    public void setApplicationRef(String applicationRef) { this.applicationRef = applicationRef; }

    public BigDecimal getMonthlyGrossIncome() { return monthlyGrossIncome; }
    public void setMonthlyGrossIncome(BigDecimal monthlyGrossIncome) { this.monthlyGrossIncome = monthlyGrossIncome; }

    public Integer getCreditScore() { return creditScore; }
    public void setCreditScore(Integer creditScore) { this.creditScore = creditScore; }

    public String getRiskCategory() { return riskCategory; }
    public void setRiskCategory(String riskCategory) { this.riskCategory = riskCategory; }

    public BigDecimal getRequestedAmount() { return requestedAmount; }
    public void setRequestedAmount(BigDecimal requestedAmount) { this.requestedAmount = requestedAmount; }

    public Integer getRequestedTermMonths() { return requestedTermMonths; }
    public void setRequestedTermMonths(Integer requestedTermMonths) { this.requestedTermMonths = requestedTermMonths; }

    public BigDecimal getDti() { return dti; }
    public void setDti(BigDecimal dti) { this.dti = dti; }

    public String getProductType() { return productType; }
    public void setProductType(String productType) { this.productType = productType; }
}
