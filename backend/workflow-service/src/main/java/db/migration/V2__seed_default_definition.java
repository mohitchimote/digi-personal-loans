package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * Seeds the default published definition (loan-origination v1) from workflow-spec/loan-origination.v1.json.
 * It is a Java migration because a SQL migration cannot embed a 20 KB JSON file; the file is bundled as
 * a resource (/workflow/loan-origination.v1.json) and DefinitionValidatorTest fails the build if the copy
 * differs from the spec file. Idempotent: does nothing when a published loan-origination version exists.
 */
public class V2__seed_default_definition extends BaseJavaMigration {

    static final String RESOURCE = "/workflow/loan-origination.v1.json";

    @Override
    public void migrate(Context context) throws Exception {
        try (Statement st = context.getConnection().createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM wf_definitions WHERE definition_key = 'loan-origination' AND status = 'PUBLISHED'")) {
            rs.next();
            if (rs.getInt(1) > 0) return;
        }
        String json;
        try (InputStream in = V2__seed_default_definition.class.getResourceAsStream(RESOURCE)) {
            if (in == null) throw new IllegalStateException("Bundled default workflow definition missing: " + RESOURCE);
            json = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        String now = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC).format(Instant.now());
        try (PreparedStatement ps = context.getConnection().prepareStatement(
                "INSERT INTO wf_definitions (definition_key, version, status, definition_json, change_note, created_at, created_by, published_at, published_by) "
                        + "VALUES (?, 1, 'PUBLISHED', ?, 'Seeded default definition', ?, 'system', ?, 'system')")) {
            ps.setString(1, "loan-origination");
            ps.setString(2, json);
            ps.setString(3, now);
            ps.setString(4, now);
            ps.executeUpdate();
        }
    }
}
