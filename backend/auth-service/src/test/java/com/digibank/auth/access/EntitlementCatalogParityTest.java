package com.digibank.auth.access;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** The Java catalog must list exactly the entitlements the Worker's catalog does, with the same text. */
class EntitlementCatalogParityTest {

    private static final Pattern ROW = Pattern.compile(
            "\\{ key: \"([^\"]+)\", group: \"([^\"]+)\", label: \"([^\"]+)\", description: \"((?:[^\"\\\\]|\\\\.)*)\" \\}");

    private static List<EntitlementDef> workerCatalog() {
        String ts = WorkerSources.read("worker/src/lib/entitlements.ts");
        List<EntitlementDef> out = new ArrayList<>();
        Matcher m = ROW.matcher(ts);
        while (m.find()) out.add(new EntitlementDef(m.group(1), m.group(2), m.group(3), m.group(4)));
        return out;
    }

    @Test
    void javaCatalogIsTheWorkerCatalog() {
        List<EntitlementDef> worker = workerCatalog();
        assertThat(worker).as("catalog parsed from worker/src/lib/entitlements.ts").hasSizeGreaterThan(10);
        assertThat(EntitlementCatalog.ALL).containsExactlyElementsOf(worker);
    }

    @Test
    void keysAreUniqueAndKnown() {
        assertThat(EntitlementCatalog.ALL).extracting(EntitlementDef::key).doesNotHaveDuplicates();
        assertThat(EntitlementCatalog.isKnown("case.branchReview")).isTrue();
        assertThat(EntitlementCatalog.isKnown("case.nonsense")).isFalse();
    }
}
