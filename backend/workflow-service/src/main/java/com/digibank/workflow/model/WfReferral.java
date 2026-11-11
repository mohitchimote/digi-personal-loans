package com.digibank.workflow.model;

import jakarta.persistence.*;

/** Row of wf_referrals. Schema is owned by Flyway (db/migration). */
@Entity
@Table(name = "wf_referrals")
public class WfReferral {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    public Long id;

    @Column(name = "application_ref")
    public String applicationRef;

    @Column(name = "from_role")
    public String fromRole;

    @Column(name = "from_user_id")
    public long fromUserId;

    @Column(name = "from_name")
    public String fromName;

    @Column(name = "to_role")
    public String toRole;

    @Column(name = "reason")
    public String reason;

    @Column(name = "created_at")
    public String createdAt;

    @Column(name = "resolved_at")
    public String resolvedAt;

    public WfReferral() {}
}
