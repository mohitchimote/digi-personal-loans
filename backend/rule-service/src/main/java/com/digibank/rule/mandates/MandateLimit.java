package com.digibank.rule.mandates;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/** One row per underwriting role (ARCHITECTURE_REVIEW_GAPS.md, G4/G6) — replaces the five fixed
 * BigDecimal fields the old in-memory MandateRules bean held, so a new role tier doesn't need a
 * schema change, just a new row. */
@Entity
@Table(name = "mandate_limits")
public class MandateLimit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String role;

    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal limitAmount;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public BigDecimal getLimitAmount() { return limitAmount; }
    public void setLimitAmount(BigDecimal limitAmount) { this.limitAmount = limitAmount; }
}
