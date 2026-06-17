package com.digibank.application.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "loan_applications")
public class LoanApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String applicationRef;

    @Column(nullable = false)
    private Long customerId;

    @Column(nullable = false)
    private String customerEmail;

    private String status = "DRAFT";
    private String currentSection = "loanRequirements";
    private Integer completionPercentage = 0;

    @Column(columnDefinition = "TEXT")
    private String loanRequirementsJson;

    @Column(columnDefinition = "TEXT")
    private String personalDetailsJson;

    @Column(columnDefinition = "TEXT")
    private String incomeEmploymentJson;

    @Column(columnDefinition = "TEXT")
    private String outgoingsJson;

    @Column(columnDefinition = "TEXT")
    private String creditDeclarationsJson;

    @Column(columnDefinition = "TEXT")
    private String reviewSubmitJson;

    private String selectedProductId;

    @Column(columnDefinition = "TEXT")
    private String selectedProductJson;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime submittedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // No-args constructor
    public LoanApplication() {}

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getApplicationRef() { return applicationRef; }
    public void setApplicationRef(String applicationRef) { this.applicationRef = applicationRef; }

    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }

    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCurrentSection() { return currentSection; }
    public void setCurrentSection(String currentSection) { this.currentSection = currentSection; }

    public Integer getCompletionPercentage() { return completionPercentage; }
    public void setCompletionPercentage(Integer completionPercentage) { this.completionPercentage = completionPercentage; }

    public String getLoanRequirementsJson() { return loanRequirementsJson; }
    public void setLoanRequirementsJson(String loanRequirementsJson) { this.loanRequirementsJson = loanRequirementsJson; }

    public String getPersonalDetailsJson() { return personalDetailsJson; }
    public void setPersonalDetailsJson(String personalDetailsJson) { this.personalDetailsJson = personalDetailsJson; }

    public String getIncomeEmploymentJson() { return incomeEmploymentJson; }
    public void setIncomeEmploymentJson(String incomeEmploymentJson) { this.incomeEmploymentJson = incomeEmploymentJson; }

    public String getOutgoingsJson() { return outgoingsJson; }
    public void setOutgoingsJson(String outgoingsJson) { this.outgoingsJson = outgoingsJson; }

    public String getCreditDeclarationsJson() { return creditDeclarationsJson; }
    public void setCreditDeclarationsJson(String creditDeclarationsJson) { this.creditDeclarationsJson = creditDeclarationsJson; }

    public String getReviewSubmitJson() { return reviewSubmitJson; }
    public void setReviewSubmitJson(String reviewSubmitJson) { this.reviewSubmitJson = reviewSubmitJson; }

    public String getSelectedProductId() { return selectedProductId; }
    public void setSelectedProductId(String selectedProductId) { this.selectedProductId = selectedProductId; }

    public String getSelectedProductJson() { return selectedProductJson; }
    public void setSelectedProductJson(String selectedProductJson) { this.selectedProductJson = selectedProductJson; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(LocalDateTime submittedAt) { this.submittedAt = submittedAt; }

    // Builder
    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final LoanApplication obj = new LoanApplication();
        public Builder applicationRef(String v) { obj.applicationRef = v; return this; }
        public Builder customerId(Long v) { obj.customerId = v; return this; }
        public Builder customerEmail(String v) { obj.customerEmail = v; return this; }
        public Builder status(String v) { obj.status = v; return this; }
        public Builder currentSection(String v) { obj.currentSection = v; return this; }
        public Builder completionPercentage(Integer v) { obj.completionPercentage = v; return this; }
        public LoanApplication build() { return obj; }
    }
}
