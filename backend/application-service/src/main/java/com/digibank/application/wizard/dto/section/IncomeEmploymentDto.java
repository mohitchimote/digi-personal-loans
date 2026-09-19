package com.digibank.application.wizard.dto.section;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public class IncomeEmploymentDto {

    @NotBlank(message = "employmentStatus is required")
    private String employmentStatus;

    private String employer;
    private String jobTitle;
    private String employmentDuration;

    @NotNull(message = "monthlyGrossIncome is required")
    @DecimalMin(value = "0", message = "monthlyGrossIncome must be >= 0")
    private Double monthlyGrossIncome;

    @NotNull(message = "monthlyNetIncome is required")
    @DecimalMin(value = "0", message = "monthlyNetIncome must be >= 0")
    private Double monthlyNetIncome;

    @NotNull(message = "otherIncome is required")
    private Double otherIncome;

    @NotNull(message = "employments is required")
    private List<@Valid EmploymentEntryDto> employments;

    @Valid
    private EmploymentEntryDto applicant2;

    public String getEmploymentStatus() { return employmentStatus; }
    public void setEmploymentStatus(String employmentStatus) { this.employmentStatus = employmentStatus; }
    public String getEmployer() { return employer; }
    public void setEmployer(String employer) { this.employer = employer; }
    public String getJobTitle() { return jobTitle; }
    public void setJobTitle(String jobTitle) { this.jobTitle = jobTitle; }
    public String getEmploymentDuration() { return employmentDuration; }
    public void setEmploymentDuration(String employmentDuration) { this.employmentDuration = employmentDuration; }
    public Double getMonthlyGrossIncome() { return monthlyGrossIncome; }
    public void setMonthlyGrossIncome(Double monthlyGrossIncome) { this.monthlyGrossIncome = monthlyGrossIncome; }
    public Double getMonthlyNetIncome() { return monthlyNetIncome; }
    public void setMonthlyNetIncome(Double monthlyNetIncome) { this.monthlyNetIncome = monthlyNetIncome; }
    public Double getOtherIncome() { return otherIncome; }
    public void setOtherIncome(Double otherIncome) { this.otherIncome = otherIncome; }
    public List<EmploymentEntryDto> getEmployments() { return employments; }
    public void setEmployments(List<EmploymentEntryDto> employments) { this.employments = employments; }
    public EmploymentEntryDto getApplicant2() { return applicant2; }
    public void setApplicant2(EmploymentEntryDto applicant2) { this.applicant2 = applicant2; }
}
