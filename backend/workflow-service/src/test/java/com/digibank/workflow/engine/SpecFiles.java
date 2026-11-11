package com.digibank.workflow.engine;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/** Locates the repo's workflow-spec directory relative to this module and reads JSON from it. */
public final class SpecFiles {
    private SpecFiles() {}

    public static final JsonMapper JSON = JsonMapper.builder().build();

    /** backend/workflow-service is the working directory when Maven runs; the spec is two levels up. */
    public static Path specDir() {
        for (Path base : new Path[]{Path.of(""), Path.of("backend/workflow-service")}) {
            Path p = base.toAbsolutePath().resolve("../../workflow-spec").normalize();
            if (Files.isDirectory(p)) return p;
        }
        return null;
    }

    public static Map<String, Object> read(Path file) {
        try {
            return JSON.readValue(Files.readString(file), new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read " + file, e);
        }
    }

    /** Deep copy via JSON, so a test can mutate its own definition. */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> copy(Map<String, Object> m) {
        return (Map<String, Object>) Js.copy(m);
    }
}
