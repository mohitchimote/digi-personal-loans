package com.digibank.application.formbuilder;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Drift guards against the Worker's own sources: the seeded default schemas, the vocabulary of the
 * schema language and the admin routes. Skipped when the Worker files are not there (a container
 * build copies only this service).
 */
class FormBuilderParityTest {

    static final ObjectMapper MAPPER = new ObjectMapper();

    static String worker(String relative) {
        Path p = Path.of("..", "..").resolve(relative).normalize();
        Assumptions.assumeTrue(Files.exists(p), "Worker source not available: " + p);
        try {
            return Files.readString(p, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void theBundledDefaultSchemasAreExactlyTheWorkersSeed() throws Exception {
        String sql = worker("worker/seed-form-versions.sql");
        Matcher m = Pattern.compile("SELECT '([^']+)', (\\d+), '(\\w+)', '((?:[^']++|'')*+)', ", Pattern.DOTALL).matcher(sql);
        Map<String, JsonNode> seeded = new LinkedHashMap<>();
        while (m.find()) {
            assertThat(m.group(2)).as("version of " + m.group(1)).isEqualTo("1");
            assertThat(m.group(3)).as("status of " + m.group(1)).isEqualTo("PUBLISHED");
            seeded.put(m.group(1), MAPPER.readTree(m.group(4).replace("''", "'")));
        }
        assertThat(seeded.keySet()).containsExactlyInAnyOrderElementsOf(FormSchemaValidator.FORM_KEYS);
        for (String formKey : FormSchemaValidator.FORM_KEYS) {
            assertThat(MAPPER.readTree(FormVersionService.defaultSchemaJson(formKey))).as(formKey).isEqualTo(seeded.get(formKey));
        }
    }

    @Test
    void everySeededSectionIsOneTheJavaWizardKnows() throws Exception {
        for (String formKey : FormSchemaValidator.FORM_KEYS) {
            for (JsonNode s : MAPPER.readTree(FormVersionService.defaultSchemaJson(formKey)).path("sections")) {
                assertThat(SectionColumns.isKnown(s.path("key").asText())).as(formKey + "/" + s.path("key").asText()).isTrue();
            }
        }
    }

    private static Set<String> quoted(String list) {
        Set<String> out = new TreeSet<>();
        Matcher m = Pattern.compile("\"([^\"]+)\"").matcher(list);
        while (m.find()) out.add(m.group(1));
        return out;
    }

    @Test
    void theSchemaVocabularyMatchesTheWorkers() {
        String ts = worker("worker/src/lib/form-schema-types.ts");
        assertThat(quoted(find(ts, "export const FIELD_TYPES = \\[([^\\]]*)\\]"))).isEqualTo(new TreeSet<>(FormSchemaValidator.FIELD_TYPES));
        assertThat(quoted(find(ts, "const COMPARISON_OPS = \\[([^\\]]*)\\]"))).isEqualTo(new TreeSet<>(FormSchemaValidator.COMPARISON_OPS));
        assertThat(quoted(find(ts, "const MEMBERSHIP_OPS = \\[([^\\]]*)\\]"))).isEqualTo(new TreeSet<>(FormSchemaValidator.MEMBERSHIP_OPS));
        assertThat(quoted(find(ts, "export const FORM_KEYS = \\[([^\\]]*)\\]"))).isEqualTo(new TreeSet<>(FormSchemaValidator.FORM_KEYS));
        // every key the Worker's strict field object lists must be one the Java validator accepts
        String fieldObject = find(ts, "export const formFieldSchema = z\\s*\\.object\\(\\{(.*?)\\n  \\}\\)\\s*\\.strict\\(\\)");
        Set<String> tsFieldKeys = new TreeSet<>();
        Matcher km = Pattern.compile("^\\s{4}(\\w+):", Pattern.MULTILINE).matcher(fieldObject);
        while (km.find()) tsFieldKeys.add(km.group(1));
        assertThat(tsFieldKeys).isNotEmpty();
        FormSchemaValidator v = new FormSchemaValidator();
        for (String key : tsFieldKeys) {
            JsonNode field = FormSchemaValidatorTest.json("{\"key\":\"f\",\"sectionHeaderKey\":\"h\",\"kind\":\"existing\",\"labelKey\":\"k\","
                    + "\"required\":true,\"order\":1,\"" + key + "\":null}");
            String schema = "{\"sections\":[{\"key\":\"s\",\"order\":1,\"sideMenuLabelKey\":\"k\",\"sectionHeaders\":[],\"fields\":[" + field + "]}]}";
            assertThat(v.validate(FormSchemaValidatorTest.json(schema))).as("field key " + key)
                    .noneMatch(i -> i.contains("unrecognized key '" + key + "'"));
        }
    }

    private static String find(String text, String regex) {
        Matcher m = Pattern.compile(regex, Pattern.DOTALL).matcher(text);
        assertThat(m.find()).as("pattern in worker source: " + regex).isTrue();
        return m.group(1);
    }

    @Test
    void theAdminRoutesAreTheWorkersRoutes() {
        String ts = worker("worker/src/routes/admin-form-builder.ts");
        Set<String> expected = new TreeSet<>();
        Matcher m = Pattern.compile("formBuilderAdmin\\.(get|post|put|delete)\\(\"([^\"]+)\"").matcher(ts);
        while (m.find()) expected.add(m.group(1).toUpperCase() + " " + m.group(2).replaceAll(":(\\w+)", "{$1}"));
        assertThat(expected).isNotEmpty();

        Set<String> actual = new TreeSet<>();
        for (Method method : FormBuilderAdminController.class.getDeclaredMethods()) {
            addMapping(actual, "GET", method.getAnnotation(GetMapping.class) == null ? null : method.getAnnotation(GetMapping.class).value());
            addMapping(actual, "POST", method.getAnnotation(PostMapping.class) == null ? null : method.getAnnotation(PostMapping.class).value());
            addMapping(actual, "PUT", method.getAnnotation(PutMapping.class) == null ? null : method.getAnnotation(PutMapping.class).value());
            addMapping(actual, "DELETE", method.getAnnotation(DeleteMapping.class) == null ? null : method.getAnnotation(DeleteMapping.class).value());
        }
        assertThat(actual).isEqualTo(expected);
        assertThat(FormBuilderAdminController.class.getAnnotation(RequestMapping.class).value())
                .containsExactly("/api/auth/admin/form-builder");
        assertThat(worker("worker/src/index.ts")).contains("app.route(\"/api/auth/admin/form-builder\", formBuilderAdmin)");
    }

    private static void addMapping(Set<String> out, String verb, String[] paths) {
        if (paths != null) for (String p : paths) out.add(verb + " " + p);
    }
}
