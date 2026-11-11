package com.digibank.workflow.model;

import jakarta.persistence.*;

/** Row of wf_commands. Schema is owned by Flyway (db/migration). */
@Entity
@Table(name = "wf_commands")
public class WfCommand {
    @Id
    @Column(name = "idempotency_key")
    public String idempotencyKey;

    @Column(name = "application_ref")
    public String applicationRef;

    @Column(name = "response_json", columnDefinition = "LONGTEXT")
    public String responseJson;

    @Column(name = "created_at")
    public String createdAt;

    public WfCommand() {}
}
