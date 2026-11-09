package com.digibank.auth.access;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * An admin-defined staff role. Customer roles (CUSTOMER, BUSINESS_OWNER) are built in and absent here.
 * {@code scope} is the case-visibility rule; {@code locked} roles (ADMIN) always hold every entitlement;
 * {@code escalationRank} is the role's place on the approval ladder (lower = more junior, unique, null = off it).
 */
@Entity
@Table(name = "roles")
public class Role {

    @Id
    private String code;

    @Column(nullable = false)
    private String label;

    private String description;

    @Column(nullable = false)
    private String scope = Scope.ALL.name();

    @Column(nullable = false)
    private boolean isSystem;

    @Column(nullable = false)
    private boolean locked;

    private Integer escalationRank;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public Role() {}

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public boolean isSystem() { return isSystem; }
    public void setSystem(boolean system) { this.isSystem = system; }
    public boolean isLocked() { return locked; }
    public void setLocked(boolean locked) { this.locked = locked; }
    public Integer getEscalationRank() { return escalationRank; }
    public void setEscalationRank(Integer escalationRank) { this.escalationRank = escalationRank; }
    public Instant getCreatedAt() { return createdAt; }
}
