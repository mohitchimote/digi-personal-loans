package com.digibank.workflow.service;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.LinkedHashMap;
import java.util.Map;

/** JSON text to and from the generic trees the engine works on (Jackson 3). */
public final class Json {
    private Json() {}

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    public static Map<String, Object> parseMap(String json) {
        return MAPPER.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
    }

    public static String write(Object value) {
        return MAPPER.writeValueAsString(value);
    }
}
