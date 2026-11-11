package com.digibank.workflow.model;

import jakarta.persistence.*;

/** Row of wf_transitions. Schema is owned by Flyway (db/migration). */
@Entity
@Table(name = "wf_transitions")
public class WfTransition {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    public Long id;

    @Column(name = "application_ref")
    public String applicationRef;

    @Column(name = "track_key")
    public String trackKey;

    @Column(name = "action")
    public String action;

    @Column(name = "event")
    public String event;

    @Column(name = "from_status")
    public String fromStatus;

    @Column(name = "to_status")
    public String toStatus;

    @Column(name = "from_stage")
    public String fromStage;

    @Column(name = "to_stage")
    public String toStage;

    @Column(name = "actor_type")
    public String actorType;

    @Column(name = "actor_user_id")
    public long actorUserId;

    @Column(name = "actor_name")
    public String actorName;

    @Column(name = "actor_role")
    public String actorRole;

    @Column(name = "reason")
    public String reason;

    @Column(name = "at")
    public String at;

    @Column(name = "definition_id")
    public long definitionId;

    public WfTransition() {}
}
