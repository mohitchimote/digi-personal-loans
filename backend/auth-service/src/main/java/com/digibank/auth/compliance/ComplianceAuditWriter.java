package com.digibank.auth.compliance;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;

/**
 * Open Point #19 (ARCHITECTURE_REVIEW_GAPS.md) — resolved in favour of a shared MySQL
 * `digibank_audit` schema over a separate MongoDB-based store: reuses existing infra, same
 * no-new-infra reasoning as the S2/S5 decisions. A flat, append-only compliance record for every
 * service that performs an auditable state change.
 *
 * Duplicated from application-service's class of the same name rather than shared — no cross-service
 * Java module exists yet (see Q2 note in ARCHITECTURE_REVIEW_GAPS.md, same constraint that already
 * applies to SessionRevocationCache and StaffRoles). Own small Hikari pool + JdbcTemplate, deliberately
 * outside the JPA-managed primary datasource.
 */
@Component
public class ComplianceAuditWriter {
    private static final Logger log = LoggerFactory.getLogger(ComplianceAuditWriter.class);
    private static final String SERVICE_NAME = "auth-service";

    private final JdbcTemplate jdbcTemplate;

    public ComplianceAuditWriter(@Value("${DB_HOST:localhost}") String dbHost,
                                  @Value("${DB_USERNAME}") String username,
                                  @Value("${DB_PASSWORD}") String password) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:mysql://" + dbHost
                + ":3306/digibank_audit?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC");
        config.setUsername(username);
        config.setPassword(password);
        config.setDriverClassName("com.mysql.cj.jdbc.Driver");
        config.setMaximumPoolSize(3);
        config.setPoolName("compliance-audit-pool");
        this.jdbcTemplate = new JdbcTemplate(new HikariDataSource(config));
    }

    @PostConstruct
    void ensureSchema() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS audit_log (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    occurred_at DATETIME NOT NULL,
                    service VARCHAR(64) NOT NULL,
                    event_type VARCHAR(128) NOT NULL,
                    subject_type VARCHAR(64) NOT NULL,
                    subject_id VARCHAR(64) NOT NULL,
                    actor VARCHAR(255),
                    actor_role VARCHAR(64),
                    detail TEXT,
                    correlation_id VARCHAR(64)
                )
                """);
    }

    /** Never allowed to block or fail the real action it's recording. */
    public void record(String eventType, String subjectType, String subjectId, String actor, String actorRole, String detail) {
        try {
            jdbcTemplate.update(
                    "INSERT INTO audit_log (occurred_at, service, event_type, subject_type, subject_id, actor, actor_role, detail, correlation_id) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    Timestamp.from(Instant.now()), SERVICE_NAME, eventType, subjectType, subjectId, actor, actorRole, detail,
                    MDC.get("correlationId"));
        } catch (Exception e) {
            log.warn("Compliance audit write failed for {}#{} ({}): {}", subjectType, subjectId, eventType, e.getMessage());
        }
    }
}
