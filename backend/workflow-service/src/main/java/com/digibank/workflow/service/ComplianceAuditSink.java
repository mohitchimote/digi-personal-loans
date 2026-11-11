package com.digibank.workflow.service;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;

/**
 * Writes to the shared flat audit_log in the digibank_audit schema (same table as the other services).
 * The pool is created on first use, not at boot, so the service starts without that schema and an audit
 * failure is logged and swallowed: it never blocks or fails the action it records.
 */
@Component
public class ComplianceAuditSink implements AuditSink {
    private static final Logger log = LoggerFactory.getLogger(ComplianceAuditSink.class);
    private static final String SERVICE_NAME = "workflow-service";

    private final String host;
    private final String username;
    private final String password;
    private volatile JdbcTemplate jdbc;

    public ComplianceAuditSink(@Value("${DB_HOST:localhost}") String host,
                               @Value("${spring.datasource.username:}") String username,
                               @Value("${spring.datasource.password:}") String password) {
        this.host = host;
        this.username = username;
        this.password = password;
    }

    private JdbcTemplate jdbc() {
        JdbcTemplate j = jdbc;
        if (j == null) {
            synchronized (this) {
                if (jdbc == null) {
                    HikariConfig config = new HikariConfig();
                    config.setJdbcUrl("jdbc:mysql://" + host
                            + ":3306/digibank_audit?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC");
                    config.setUsername(username);
                    config.setPassword(password);
                    config.setDriverClassName("com.mysql.cj.jdbc.Driver");
                    config.setMaximumPoolSize(2);
                    config.setPoolName("workflow-audit-pool");
                    config.setInitializationFailTimeout(-1);
                    JdbcTemplate created = new JdbcTemplate(new HikariDataSource(config));
                    created.execute("""
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
                    jdbc = created;
                }
                j = jdbc;
            }
        }
        return j;
    }

    @Override
    public void record(String eventType, String subjectType, String subjectId, String actor, String actorRole, String detail) {
        try {
            jdbc().update(
                    "INSERT INTO audit_log (occurred_at, service, event_type, subject_type, subject_id, actor, actor_role, detail, correlation_id) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    Timestamp.from(Instant.now()), SERVICE_NAME, eventType, subjectType, subjectId, actor, actorRole, detail, MDC.get("correlationId"));
        } catch (Exception e) {
            log.warn("Compliance audit write failed for {}#{} ({}): {}", subjectType, subjectId, eventType, e.getMessage());
        }
    }
}
