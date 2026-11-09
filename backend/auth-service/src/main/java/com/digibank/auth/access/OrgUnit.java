package com.digibank.auth.access;

import jakarta.persistence.*;
import java.time.Instant;

/** A node in the organisation hierarchy. A null parent is a root; a unit's level is deeper than its parent's. */
@Entity
@Table(name = "org_units")
public class OrgUnit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private Long levelId;

    private Long parentId;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public OrgUnit() {}

    public Long getId() { return id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Long getLevelId() { return levelId; }
    public void setLevelId(Long levelId) { this.levelId = levelId; }
    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
}
