package com.digibank.workflow.model;

import jakarta.persistence.*;

/** Row of wf_definitions. Schema is owned by Flyway (db/migration). */
@Entity
@Table(name = "wf_definitions")
public class WfDefinition {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    public Long id;

    @Column(name = "definition_key")
    public String definitionKey;

    @Column(name = "version")
    public int version;

    @Column(name = "status")
    public String status;

    @Column(name = "definition_json", columnDefinition = "LONGTEXT")
    public String definitionJson;

    @Column(name = "change_note")
    public String changeNote;

    @Column(name = "created_at")
    public String createdAt;

    @Column(name = "created_by")
    public String createdBy;

    @Column(name = "published_at")
    public String publishedAt;

    @Column(name = "published_by")
    public String publishedBy;

    public WfDefinition() {}
}
