package com.digibank.auth.access;

import jakarta.persistence.*;

/** A tier of the organisation (Head Office, Region, Branch). Deeper tiers have a larger depth. */
@Entity
@Table(name = "org_levels")
public class OrgLevel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String name;

    @Column(nullable = false)
    private int depth;

    public OrgLevel() {}

    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getDepth() { return depth; }
    public void setDepth(int depth) { this.depth = depth; }
}
