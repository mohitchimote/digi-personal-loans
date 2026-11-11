package com.digibank.application.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * A workflow action this service has fully applied, keyed by the request's idempotency key. Written in the same
 * transaction as the action's effects, so its presence means "applied": a retry of the same request (after a
 * lost response, say) is answered with the case as it is, without running the effects, notes or emails twice.
 * The other direction (workflow-service committed but this service did not) is healed by the same key: the engine
 * replays its first answer and the effects are applied then.
 */
@Entity
@Table(name = "processed_commands")
public class ProcessedCommand {

    @Id
    @Column(name = "idempotency_key", length = 100)
    private String idempotencyKey;

    @Column(nullable = false)
    private String applicationRef;

    @Column(nullable = false)
    private String action;

    private LocalDateTime createdAt = LocalDateTime.now();

    public ProcessedCommand() {}

    public ProcessedCommand(String idempotencyKey, String applicationRef, String action) {
        this.idempotencyKey = idempotencyKey;
        this.applicationRef = applicationRef;
        this.action = action;
    }

    public String getIdempotencyKey() { return idempotencyKey; }
    public String getApplicationRef() { return applicationRef; }
    public String getAction() { return action; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
