package com.digibank.document.dto;

public class DocumentGenerationRequest {
    private String applicationRef;
    private Long customerId;
    private String documentType;  // APPROVAL_LETTER, LOAN_AGREEMENT, REPAYMENT_SCHEDULE
    private String customerName;
    private Double loanAmount;
    private String productName;
    private Double interestRate;
    private Integer termMonths;
    private Double monthlyRepayment;

    public String getApplicationRef() { return applicationRef; }
    public void setApplicationRef(String applicationRef) { this.applicationRef = applicationRef; }

    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }

    public String getDocumentType() { return documentType; }
    public void setDocumentType(String documentType) { this.documentType = documentType; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public Double getLoanAmount() { return loanAmount; }
    public void setLoanAmount(Double loanAmount) { this.loanAmount = loanAmount; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public Double getInterestRate() { return interestRate; }
    public void setInterestRate(Double interestRate) { this.interestRate = interestRate; }

    public Integer getTermMonths() { return termMonths; }
    public void setTermMonths(Integer termMonths) { this.termMonths = termMonths; }

    public Double getMonthlyRepayment() { return monthlyRepayment; }
    public void setMonthlyRepayment(Double monthlyRepayment) { this.monthlyRepayment = monthlyRepayment; }
}
