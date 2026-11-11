package com.digibank.rule.mandates;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** Reads the Worker's own sources so the two backends cannot drift apart on the numbers and the rule. */
class MandateParityTest {

    @Test
    void theSeededDefaultsAreTheOnesTheWorkersMigrationInserts() {
        String sql = WorkerSources.read("worker/migrations/0014_living_blink.sql");
        Matcher m = Pattern.compile("SELECT '([A-Z_]+)', ([0-9.]+) WHERE NOT EXISTS").matcher(sql);
        Map<String, Double> fromWorker = new LinkedHashMap<>();
        while (m.find()) fromWorker.put(m.group(1), Double.parseDouble(m.group(2)));
        assertThat(fromWorker).hasSize(5);
        assertThat(MandateSeeder.DEFAULTS).isEqualTo(fromWorker);
    }

    @Test
    void theWorkersResolverStillSortsByUnitDistanceThenTypeMatch() {
        // If the Worker changes its precedence, this fails and MandateResolver must be revisited with it.
        String ts = WorkerSources.read("worker/src/lib/mandates.ts").replaceAll("\\s+", " ");
        assertThat(ts).contains("candidates.sort((a, b) => a.unitDist - b.unitDist || Number(b.typeMatch) - Number(a.typeMatch))");
        assertThat(ts).contains("unitDist: m.orgUnitId == null ? Number.POSITIVE_INFINITY : chain.indexOf(m.orgUnitId)");
        assertThat(ts).contains("(m.orgUnitId == null || chain.includes(m.orgUnitId)) && (m.applicationType == null || m.applicationType === applicationType)");
        assertThat(ts).contains(": { limit: 0, orgUnitId: null, applicationType: null }");
    }

    @Test
    void theAdminRoutesAreAdminOnlyAndKeepTheWorkersMessages() {
        String ts = WorkerSources.read("worker/src/routes/admin-mandates.ts");
        assertThat(ts).contains("mandatesAdmin.use(\"*\", requireAuth, requireRole(\"ADMIN\"))");
        for (String message : new String[] {
                "Mandates can only be set for roles on the escalation ladder (give the role a rank first).",
                "Unknown org unit.",
                "A mandate for that role, unit and application type already exists - edit it instead.",
                "Mandate not found." }) {
            assertThat(ts).contains(message);
        }
    }
}
