package com.digibank.rule.mandates;

import org.junit.jupiter.api.Assumptions;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Reads files from the Worker half of the repository, for the parity tests; skips when they are not there. */
public final class WorkerSources {

    private WorkerSources() {}

    public static String read(String relative) {
        Path p = Path.of("..", "..").resolve(relative).normalize();
        Assumptions.assumeTrue(Files.exists(p), "Worker source not available: " + p);
        try {
            return Files.readString(p, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
