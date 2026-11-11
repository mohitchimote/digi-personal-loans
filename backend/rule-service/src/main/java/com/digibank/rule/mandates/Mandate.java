package com.digibank.rule.mandates;

import jakarta.persistence.*;

/**
 * An approval limit for a ladder role, optionally narrowed to an org unit (and the units below it) and/or an
 * application type. The table and columns are the Worker's (mandates: role_code, org_unit_id, application_type,
 * max_amount). A null unit or type means "any".
 */
@Entity
@Table(name = "mandates")
public class Mandate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String roleCode;

    private Long orgUnitId;

    private String applicationType;

    @Column(nullable = false)
    private double maxAmount;

    public Mandate() {}

    public Mandate(String roleCode, Long orgUnitId, String applicationType, double maxAmount) {
        this.roleCode = roleCode;
        this.orgUnitId = orgUnitId;
        this.applicationType = applicationType;
        this.maxAmount = maxAmount;
    }

    public Long getId() { return id; }
    public String getRoleCode() { return roleCode; }
    public void setRoleCode(String roleCode) { this.roleCode = roleCode; }
    public Long getOrgUnitId() { return orgUnitId; }
    public void setOrgUnitId(Long orgUnitId) { this.orgUnitId = orgUnitId; }
    public String getApplicationType() { return applicationType; }
    public void setApplicationType(String applicationType) { this.applicationType = applicationType; }
    public double getMaxAmount() { return maxAmount; }
    public void setMaxAmount(double maxAmount) { this.maxAmount = maxAmount; }
}
