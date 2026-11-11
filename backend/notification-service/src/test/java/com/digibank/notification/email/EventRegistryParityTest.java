package com.digibank.notification.email;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** Fails when the Worker's email event registry (keys, labels, descriptions, variables, samples) drifts from the Java one. */
class EventRegistryParityTest {

    private static final Path WORKER_FILE = Path.of("..", "..", "worker", "src", "lib", "email-events.ts");
    private static final Path JAVA_FILE = Path.of("src", "main", "java", "com", "digibank", "notification", "email", "EventRegistry.java");
    private static final Pattern LITERAL = Pattern.compile("\"((?:[^\"\\\\]|\\\\.)*)\"|`((?:[^`\\\\]|\\\\.)*)`");

    private static String norm(String s) {
        return s.replaceAll("\\s+", " ").trim();
    }

    @Test
    void everyStringInTheWorkersRegistryExistsInTheJavaRegistry() throws IOException {
        Assumptions.assumeTrue(Files.exists(WORKER_FILE) && Files.exists(JAVA_FILE), "Worker sources not present");
        String ts = Files.readString(WORKER_FILE, StandardCharsets.UTF_8)
                .replaceAll("(?s)/\\*.*?\\*/", "").lines().filter(l -> !l.trim().startsWith("//")).reduce("", (a, b) -> a + b + "\n");
        StringBuilder java = new StringBuilder();
        Matcher jm = LITERAL.matcher(Files.readString(JAVA_FILE, StandardCharsets.UTF_8));
        while (jm.find()) if (jm.group(1) != null) java.append(jm.group(1));
        String blob = norm(java.toString());

        List<String> missing = new ArrayList<>();
        Matcher m = LITERAL.matcher(ts);
        while (m.find()) {
            String lit = norm(m.group(1) != null ? m.group(1) : m.group(2));
            if (lit.length() < 3 || lit.startsWith(".")) continue;
            if (!blob.contains(lit)) missing.add(lit);
        }
        assertThat(missing).isEmpty();
    }

    @Test
    void theEventKeysAreTheSameAndInTheSameOrder() throws IOException {
        Assumptions.assumeTrue(Files.exists(WORKER_FILE), "Worker sources not present");
        String ts = Files.readString(WORKER_FILE, StandardCharsets.UTF_8);
        List<String> workerKeys = new ArrayList<>();
        Matcher m = Pattern.compile("eventKey: \"([A-Z_]+)\"").matcher(ts);
        while (m.find()) workerKeys.add(m.group(1));
        assertThat(workerKeys).isNotEmpty();
        assertThat(EventRegistry.EVENT_KEYS).containsExactlyElementsOf(workerKeys);
    }
}
