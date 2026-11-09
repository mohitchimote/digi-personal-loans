package com.digibank.auth.access;

import org.junit.jupiter.api.Test;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** A fresh Java install must start from the same roles, scopes, ladder ranks and entitlements as the Worker's seed SQL. */
class DefaultRolesParityTest {

    private static final String ROLES_SQL = "worker/migrations/0012_sparkling_mojo.sql";
    private static final String RANKS_SQL = "worker/migrations/0013_condemned_bishop.sql";
    private static final String ASSIGN_SQL = "worker/migrations/0015_smiling_bullseye.sql";

    private static DefaultRole java(String code) {
        return DefaultRoles.ALL.stream().filter(r -> r.code().equals(code)).findFirst().orElseThrow();
    }

    @Test
    void sameRolesWithSameScopeLockAndLabel() {
        String sql = WorkerSources.read(ROLES_SQL);
        Matcher m = Pattern.compile(
                "INSERT INTO `roles` \\(`code`,`label`,`scope`,`is_system`,`locked`,`created_at`\\) VALUES \\('([A-Z_]+)','([^']+)','([A-Z_]+)',1,([01]),").matcher(sql);
        Map<String, String[]> worker = new LinkedHashMap<>();
        while (m.find()) worker.put(m.group(1), new String[]{m.group(2), m.group(3), m.group(4)});
        assertThat(worker.keySet()).containsExactlyInAnyOrderElementsOf(DefaultRoles.ALL.stream().map(DefaultRole::code).toList());
        worker.forEach((code, v) -> {
            DefaultRole r = java(code);
            assertThat(r.label()).as(code + " label").isEqualTo(v[0]);
            assertThat(r.scope().name()).as(code + " scope").isEqualTo(v[1]);
            assertThat(r.locked() ? "1" : "0").as(code + " locked").isEqualTo(v[2]);
        });
    }

    @Test
    void sameEscalationLadder() {
        String sql = WorkerSources.read(RANKS_SQL);
        Matcher m = Pattern.compile("SET `escalation_rank` = (\\d+) WHERE `code` = '([A-Z_]+)'").matcher(sql);
        Map<String, Integer> worker = new HashMap<>();
        while (m.find()) worker.put(m.group(2), Integer.parseInt(m.group(1)));
        assertThat(worker).isNotEmpty();
        for (DefaultRole r : DefaultRoles.ALL) {
            assertThat(r.rank()).as(r.code() + " rank").isEqualTo(worker.get(r.code()));
        }
    }

    @Test
    void sameEntitlementsPerRole() {
        Map<String, Set<String>> worker = new HashMap<>();
        Matcher m = Pattern.compile("INSERT INTO `role_entitlements` \\(`role_code`,`entitlement`\\) VALUES \\('([A-Z_]+)','([A-Za-z.]+)'\\)")
                .matcher(WorkerSources.read(ROLES_SQL));
        while (m.find()) worker.computeIfAbsent(m.group(1), k -> new TreeSet<>()).add(m.group(2));
        // 0015 gives the senior roles case.assign
        String assign = WorkerSources.read(ASSIGN_SQL);
        Matcher a = Pattern.compile("role_code IN \\(([^)]*)\\)").matcher(assign);
        // the statement is "... FROM roles WHERE code IN ('A','B',...)"
        Matcher codes = Pattern.compile("WHERE code IN \\(([^)]*)\\)").matcher(assign);
        assertThat(codes.find()).as("case.assign grant in 0015").isTrue();
        for (String c : codes.group(1).replace("'", "").split(",")) worker.computeIfAbsent(c.trim(), k -> new TreeSet<>()).add("case.assign");

        for (DefaultRole r : DefaultRoles.ALL) {
            if (r.locked()) continue; // holds everything by being locked, no rows
            assertThat(new TreeSet<>(r.entitlements())).as(r.code() + " entitlements").isEqualTo(worker.get(r.code()));
        }
    }

    @Test
    void everyDefaultEntitlementIsInTheCatalog() {
        for (DefaultRole r : DefaultRoles.ALL) {
            assertThat(EntitlementCatalog.KEYS).as(r.code()).containsAll(r.entitlements());
        }
    }
}
