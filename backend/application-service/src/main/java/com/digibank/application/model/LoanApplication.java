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

    /** "PERSONAL" (default — every pre-existing row) or "BUSINESS". Drives which section list/JSON
     * columns ApplicationService reads/writes; decision/disbursement/notes machinery is shared. */
    private String applicationType = "PERSONAL";

    @Column(columnDefinition = "TEXT")
    private String loanRequirementsJson;

    @Column(columnDefinition = "TEXT")
    private String consentManagementJson;

    @Column(columnDefinition = "TEXT")
    private String personalDetailsJson;

    @Column(columnDefinition = "TEXT")
    private String bankConnectionJson;

    @Column(columnDefinition = "TEXT")
    private String incomeEmploymentJson;

    @Column(columnDefinition = "TEXT")
    private String outgoingsJson;

    @Column(columnDefinition = "TEXT")
    private String creditDeclarationsJson;

    @Column(columnDefinition = "TEXT")
    private String verifyIdJson;

    @Column(columnDefinition = "TEXT")
    private String directDebitJson;

    @Column(columnDefinition = "TEXT")
    private String reviewSubmitJson;

    private String disbursementStatus;

    private java.math.BigDecimal approvedAmount;

    private String selectedProductId;

    @Column(columnDefinition = "TEXT")
    private String selectedProductJson;

    @Column(columnDefinition = "TEXT")
    private String affordabilityResultJson;

    @Column(columnDefinition = "TEXT")
    private String dataVerificationJson;

    // Business-loan sections (applicationType = "BUSINESS") — null for personal applications
    @Column(columnDefinition = "TEXT")
    private String companyDetailsJson;

    @Column(columnDefinition = "TEXT")
    private String signatoriesJson;

    @Column(columnDefinition = "TEXT")
    private String businessBankConnectionJson;

    @Column(columnDefinition = "TEXT")
    private String businessFinancialsJson;

    @Column(columnDefinition = "TEXT")
    private String businessOutgoingsJson;

    @Column(columnDefinition = "TEXT")
    private String businessCreditDeclarationsJson;

    /** Demo-fabricated Financial Ratios / P&L / Cashflow / Risk Grade panel for the underwriter,
     * generated once a qualifying business document is uploaded (see BusinessFinancialsAnalysisService)
     * and cached here so it stays stable across reloads — same "fake it" pattern as dataVerificationJson. */
    @Column(columnDefinition = "TEXT")
    private String businessFinancialsAnalysisJson;

    /** Guarantor is never asked in the first pass — only set true when an underwriter sends the
     * case back specifically requesting one (see ApplicationService.sendBackApplication). Shared
     * by both journeys (guarantor shape doesn't differ between personal and business). */
    private Boolean guarantorRequired = false;

    @Column(columnDefinition = "TEXT")
    private String guarantorDetailsJson;

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

    public String getApplicationType() { return applicationType; }
    public void setApplicationType(String applicationType) { this.applicationType = applicationType; }

    public String getLoanRequirementsJson() { return loanRequirementsJson; }
    public void setLoanRequirementsJson(String loanRequirementsJson) { this.loanRequirementsJson = loanRequirementsJson; }

    public String getConsentManagementJson() { return consentManagementJson; }
    public void setConsentManagementJson(String consentManagementJson) { this.consentManagementJson = consentManagementJson; }

    public String getPersonalDetailsJson() { return personalDetailsJson; }
    public void setPersonalDetailsJson(String personalDetailsJson) { this.personalDetailsJson = personalDetailsJson; }

    public String getBankConnectionJson() { return bankConnectionJson; }
    public void setBankConnectionJson(String bankConnectionJson) { this.bankConnectionJson = bankConnectionJson; }

    public String getIncomeEmploymentJson() { return incomeEmploymentJson; }
    public void setIncomeEmploymentJson(String incomeEmploymentJson) { this.incomeEmploymentJson = incomeEmploymentJson; }

    public String getOutgoingsJson() { return outgoingsJson; }
    public void setOutgoingsJson(String outgoingsJson) { this.outgoingsJson = outgoingsJson; }

    public String getCreditDeclarationsJson() { return creditDeclarationsJson; }
    public void setCreditDeclarationsJson(String creditDeclarationsJson) { this.creditDeclarationsJson = creditDeclarationsJson; }

    public String getVerifyIdJson() { return verifyIdJson; }
    public void setVerifyIdJson(String verifyIdJson) { this.verifyIdJson = verifyIdJson; }

    public String getDirectDebitJson() { return directDebitJson; }
    public void setDirectDebitJson(String directDebitJson) { this.directDebitJson = directDebitJson; }

    public String getReviewSubmitJson() { return reviewSubmitJson; }
    public void setReviewSubmitJson(String reviewSubmitJson) { this.reviewSubmitJson = reviewSubmitJson; }

    public String getDisbursementStatus() { return disbursementStatus; }
    public void setDisbursementStatus(String disbursementStatus) { this.disbursementStatus = disbursementStatus; }

    public java.math.BigDecimal getApprovedAmount() { return approvedAmount; }
    public void setApprovedAmount(java.math.BigDecimal approvedAmount) { this.approvedAmount = approvedAmount; }

    public String getSelectedProductId() { return selectedProductId; }
    public void setSelectedProductId(String selectedProductId) { this.selectedProductId = selectedProductId; }

    public String getSelectedProductJson() { return selectedProductJson; }
    public void setSelectedProductJson(String selectedProductJson) { this.selectedProductJson = selectedProductJson; }

    public String getAffordabilityResultJson() { return affordabilityResultJson; }
    public void setAffordabilityResultJson(String affordabilityResultJson) { this.affordabilityResultJson = affordabilityResultJson; }

    public String getDataVerificationJson() { return dataVerificationJson; }
    public void setDataVerificationJson(String dataVerificationJson) { this.dataVerificationJson = dataVerificationJson; }

    public String getCompanyDetailsJson() { return companyDetailsJson; }
    public void setCompanyDetailsJson(String companyDetailsJson) { this.companyDetailsJson = companyDetailsJson; }

    public String getSignatoriesJson() { return signatoriesJson; }
    public void setSignatoriesJson(String signatoriesJson) { this.signatoriesJson = signatoriesJson; }

    public String getBusinessBankConnectionJson() { return businessBankConnectionJson; }
    public void setBusinessBankConnectionJson(String businessBankConnectionJson) { this.businessBankConnectionJson = businessBankConnectionJson; }

    public String getBusinessFinancialsJson() { return businessFinancialsJson; }
    public void setBusinessFinancialsJson(String businessFinancialsJson) { this.businessFinancialsJson = businessFinancialsJson; }

    public String getBusinessOutgoingsJson() { return businessOutgoingsJson; }
    public void setBusinessOutgoingsJson(String businessOutgoingsJson) { this.businessOutgoingsJson = businessOutgoingsJson; }

    public String getBusinessCreditDeclarationsJson() { return businessCreditDeclarationsJson; }
    public void setBusinessCreditDeclarationsJson(String businessCreditDeclarationsJson) { this.businessCreditDeclarationsJson = businessCreditDeclarationsJson; }

    public String getBusinessFinancialsAnalysisJson() { return businessFinancialsAnalysisJson; }
    public void setBusinessFinancialsAnalysisJson(String businessFinancialsAnalysisJson) { this.businessFinancialsAnalysisJson = businessFinancialsAnalysisJson; }

    public Boolean getGuarantorRequired() { return guarantorRequired; }
    public void setGuarantorRequired(Boolean guarantorRequired) { this.guarantorRequired = guarantorRequired; }

    public String getGuarantorDetailsJson() { return guarantorDetailsJson; }
    public void setGuarantorDetailsJson(String guarantorDetailsJson) { this.guarantorDetailsJson = guarantorDetailsJson; }

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
        public Builder applicationType(String v) { obj.applicationType = v; return this; }
        public LoanApplication build() { return obj; }
    }
}
