package com.digibank.workflow.model;

import jakarta.persistence.*;

/** Row of wf_cases. Schema is owned by Flyway (db/migration). */
@Entity
@Table(name = "wf_cases")
public class WfCase {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    public Long id;

    @Column(name = "application_ref")
    public String applicationRef;

    @Column(name = "definition_id")
    public long definitionId;

    @Column(name = "created_at")
    public String createdAt;

    public WfCase() {}
}
