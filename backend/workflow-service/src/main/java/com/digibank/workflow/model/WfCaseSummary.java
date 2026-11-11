package com.digibank.workflow.model;

import jakarta.persistence.*;

/** Row of wf_case_summary. Schema is owned by Flyway (db/migration). */
@Entity
@Table(name = "wf_case_summary")
public class WfCaseSummary {
    @Id
    @Column(name = "application_ref")
    public String applicationRef;

    @Column(name = "application_type")
    public String applicationType;

    @Column(name = "org_unit_id")
    public Long orgUnitId;

    @Column(name = "customer_id")
    public Long customerId;

    @Column(name = "applicant_name")
    public String applicantName;

    @Column(name = "amount")
    public Double amount;

    @Column(name = "purpose")
    public String purpose;

    @Column(name = "term_months")
    public Integer termMonths;

    @Column(name = "status")
    public String status;

    @Column(name = "disbursement_status")
    public String disbursementStatus;

    @Column(name = "referred_to_role")
    public String referredToRole;

    @Column(name = "approved_amount")
    public Double approvedAmount;

    @Column(name = "guarantor_required")
    public boolean guarantorRequired;

    @Column(name = "guarantor_details_present")
    public boolean guarantorDetailsPresent;

    @Column(name = "current_section")
    public String currentSection;

    @Column(name = "updated_at")
    public String updatedAt;

    public WfCaseSummary() {}
}
