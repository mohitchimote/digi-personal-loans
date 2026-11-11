package com.digibank.workflow.model;

import jakarta.persistence.*;

/** Row of wf_staff_availability. Schema is owned by Flyway (db/migration). */
@Entity
@Table(name = "wf_staff_availability")
public class WfStaffAvailability {
    @Id
    @Column(name = "user_id")
    public Long userId;

    @Column(name = "available")
    public boolean available;

    @Column(name = "updated_at")
    public String updatedAt;

    public WfStaffAvailability() {}
}
