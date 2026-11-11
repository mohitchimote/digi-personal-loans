-- Case workflow state for the Java stack. Equivalent to the Worker's wf_* tables (worker/migrations/0014,
-- 0015) plus what a separate service needs that the Worker keeps in its shared database: referral rows,
-- a summary of each case pushed by application-service, per-person availability and idempotency records.
-- Timestamps are ISO-8601 strings in UTC exactly as the Worker writes them, so both stacks compare and
-- display them identically.

CREATE TABLE wf_definitions (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    definition_key VARCHAR(64) NOT NULL,
    version       INT          NOT NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'DRAFT',
    definition_json LONGTEXT   NOT NULL,
    change_note   VARCHAR(300) NULL,
    created_at    VARCHAR(32)  NOT NULL,
    created_by    VARCHAR(255) NULL,
    published_at  VARCHAR(32)  NULL,
    published_by  VARCHAR(255) NULL,
    CONSTRAINT wf_definitions_key_version_unique UNIQUE (definition_key, version)
);
CREATE INDEX wf_definitions_key_status_idx ON wf_definitions (definition_key, status);

-- One row per case: the definition version it is pinned to (set when it registers, never changed).
CREATE TABLE wf_cases (
    id              BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    application_ref VARCHAR(64) NOT NULL,
    definition_id   BIGINT      NOT NULL,
    created_at      VARCHAR(32) NOT NULL,
    CONSTRAINT wf_cases_application_ref_unique UNIQUE (application_ref),
    CONSTRAINT wf_cases_definition_fk FOREIGN KEY (definition_id) REFERENCES wf_definitions (id)
);

-- One row per track (case, disbursement, ...): where the case is now, since when, and who owns it.
CREATE TABLE wf_case_tracks (
    application_ref  VARCHAR(64)  NOT NULL,
    track_key        VARCHAR(64)  NOT NULL,
    status           VARCHAR(64)  NOT NULL,
    stage            VARCHAR(64)  NULL,
    entered_at       VARCHAR(32)  NOT NULL,
    assignee_user_id BIGINT       NULL,
    assignee_name    VARCHAR(255) NULL,
    assigned_at      VARCHAR(32)  NULL,
    PRIMARY KEY (application_ref, track_key)
);
CREATE INDEX wf_case_tracks_assignee_idx ON wf_case_tracks (assignee_user_id, track_key);
CREATE INDEX wf_case_tracks_status_idx ON wf_case_tracks (track_key, status);

-- Immutable history of every workflow move.
CREATE TABLE wf_transitions (
    id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    application_ref VARCHAR(64) NOT NULL,
    track_key      VARCHAR(64)  NOT NULL,
    action         VARCHAR(64)  NOT NULL,
    event          VARCHAR(128) NULL,
    from_status    VARCHAR(64)  NOT NULL,
    to_status      VARCHAR(64)  NOT NULL,
    from_stage     VARCHAR(64)  NULL,
    to_stage       VARCHAR(64)  NULL,
    actor_type     VARCHAR(16)  NOT NULL,
    actor_user_id  BIGINT       NOT NULL,
    actor_name     VARCHAR(255) NOT NULL,
    actor_role     VARCHAR(64)  NULL,
    reason         TEXT         NULL,
    at             VARCHAR(32)  NOT NULL,
    definition_id  BIGINT       NOT NULL
);
CREATE INDEX wf_transitions_application_ref_idx ON wf_transitions (application_ref);

-- Referral rows (the Worker's case_referrals): opened by REFERRAL_OPEN, closed by REFERRAL_CLOSE.
CREATE TABLE wf_referrals (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    application_ref VARCHAR(64)  NOT NULL,
    from_role       VARCHAR(64)  NOT NULL,
    from_user_id    BIGINT       NOT NULL,
    from_name       VARCHAR(255) NOT NULL,
    to_role         VARCHAR(64)  NOT NULL,
    reason          TEXT         NULL,
    created_at      VARCHAR(32)  NOT NULL,
    resolved_at     VARCHAR(32)  NULL
);
CREATE INDEX wf_referrals_application_ref_idx ON wf_referrals (application_ref);

-- What the engine and the queues need to know about the application, pushed by application-service.
-- The engine-relevant fields (referred_to_role ... current_section) are the host-owned case fields.
CREATE TABLE wf_case_summary (
    application_ref          VARCHAR(64)  NOT NULL PRIMARY KEY,
    application_type         VARCHAR(16)  NOT NULL DEFAULT 'PERSONAL',
    org_unit_id              BIGINT       NULL,
    customer_id              BIGINT       NULL,
    applicant_name           VARCHAR(255) NULL,
    amount                   DOUBLE       NULL,
    purpose                  VARCHAR(255) NULL,
    term_months              INT          NULL,
    status                   VARCHAR(64)  NULL,
    disbursement_status      VARCHAR(64)  NULL,
    referred_to_role         VARCHAR(64)  NULL,
    approved_amount          DOUBLE       NULL,
    guarantor_required       BOOLEAN      NOT NULL DEFAULT FALSE,
    guarantor_details_present BOOLEAN     NOT NULL DEFAULT FALSE,
    current_section          VARCHAR(64)  NULL,
    updated_at               VARCHAR(32)  NOT NULL
);
CREATE INDEX wf_case_summary_unit_idx ON wf_case_summary (org_unit_id);

-- Whether a staff member currently receives automatically routed cases (the Worker's users.is_available).
CREATE TABLE wf_staff_availability (
    user_id    BIGINT      NOT NULL PRIMARY KEY,
    available  BOOLEAN     NOT NULL,
    updated_at VARCHAR(32) NOT NULL
);

-- A committed evaluation, keyed by the caller's idempotency key, so a retried call replays its answer.
CREATE TABLE wf_commands (
    idempotency_key VARCHAR(128) NOT NULL PRIMARY KEY,
    application_ref VARCHAR(64)  NOT NULL,
    response_json   LONGTEXT     NOT NULL,
    created_at      VARCHAR(32)  NOT NULL
);
