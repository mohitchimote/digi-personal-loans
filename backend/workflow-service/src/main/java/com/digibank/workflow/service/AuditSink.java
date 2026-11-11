package com.digibank.workflow.service;

/**
 * Where workflow-service writes the audit rows it owns (definition lifecycle, claim/assign/release,
 * auto-assignment). Case-event audit rows for transitions are written by application-service (the host),
 * from the {@code audit} block of the commit response. The default implementation is the shared
 * digibank_audit schema, like every other service.
 */
public interface AuditSink {
    void record(String eventType, String subjectType, String subjectId, String actor, String actorRole, String detail);
}
