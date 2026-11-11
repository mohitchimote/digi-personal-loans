package com.digibank.workflow.model;

import jakarta.persistence.*;

/** Row of wf_case_tracks: one per (case, track). Schema is owned by Flyway. */
@Entity
@Table(name = "wf_case_tracks")
@IdClass(WfCaseTrack.Key.class)
public class WfCaseTrack {
    public record Key(String applicationRef, String trackKey) implements java.io.Serializable {}

    @Id @Column(name = "application_ref") public String applicationRef;
    @Id @Column(name = "track_key") public String trackKey;
    @Column(name = "status") public String status;
    @Column(name = "stage") public String stage;
    @Column(name = "entered_at") public String enteredAt;
    @Column(name = "assignee_user_id") public Long assigneeUserId;
    @Column(name = "assignee_name") public String assigneeName;
    @Column(name = "assigned_at") public String assignedAt;

    public WfCaseTrack() {}
}
