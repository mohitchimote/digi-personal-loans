package com.digibank.application.formbuilder;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * The strict shape check for form_versions.schemaJson: a port of worker/src/lib/form-schema-types.ts's
 * Zod schema (formVersionSchemaSchema). Unknown keys are rejected at every level, and the cross-field
 * rules (a custom field needs a type, a label is needed, option codes are unique and non-empty,
 * optionsDependOn points at an earlier field of the same section) are applied. Returns every issue
 * found rather than stopping at the first.
 */
@Component
public class FormSchemaValidator {

    public static final List<String> FORM_KEYS = List.of("personal-loan-wizard", "business-loan-wizard");
    static final Set<String> FIELD_TYPES = Set.of("text", "number", "date", "select", "radio", "checkbox", "textarea");
    static final Set<String> COMPARISON_OPS = Set.of("equals", "notEquals", "gt", "gte", "lt", "lte", "contains");
    static final Set<String> MEMBERSHIP_OPS = Set.of("in", "notIn");

    public static boolean isFormKey(String v) {
        return FORM_KEYS.contains(v);
    }

    /** Throws IllegalArgumentException with a readable issue list when the schema is malformed. */
    public void assertValid(JsonNode schema) {
        List<String> issues = validate(schema);
        if (!issues.isEmpty()) {
            throw new IllegalArgumentException("Invalid form schema: " + String.join("; ", issues));
        }
    }

    public List<String> validate(JsonNode root) {
        List<String> issues = new ArrayList<>();
        if (!obj(root, "schema", issues)) return issues;
        strictKeys(root, "schema", Set.of("sections", "constants"), issues);
        JsonNode sections = root.get("sections");
        if (sections == null || !sections.isArray()) {
            issues.add("sections: expected an array");
        } else {
            for (int i = 0; i < sections.size(); i++) section(sections.get(i), "sections[" + i + "]", issues);
        }
        JsonNode constants = root.get("constants");
        if (constants != null) {
            if (!constants.isArray()) issues.add("constants: expected an array");
            else for (int i = 0; i < constants.size(); i++) {
                JsonNode c = constants.get(i);
                String p = "constants[" + i + "]";
                if (!obj(c, p, issues)) continue;
                strictKeys(c, p, Set.of("key", "label", "value"), issues);
                str(c, "key", p, true, issues);
                str(c, "label", p, true, issues);
                num(c, "value", p, true, issues);
            }
        }
        return issues;
    }

    private void section(JsonNode s, String p, List<String> issues) {
        if (!obj(s, p, issues)) return;
        strictKeys(s, p, Set.of("key", "order", "sideMenuLabelKey", "sectionHeaders", "fields"), issues);
        str(s, "key", p, true, issues);
        num(s, "order", p, true, issues);
        str(s, "sideMenuLabelKey", p, true, issues);
        JsonNode headers = s.get("sectionHeaders");
        if (headers == null || !headers.isArray()) issues.add(p + ".sectionHeaders: expected an array");
        else for (int i = 0; i < headers.size(); i++) header(headers.get(i), p + ".sectionHeaders[" + i + "]", issues);

        JsonNode fields = s.get("fields");
        if (fields == null || !fields.isArray()) {
            issues.add(p + ".fields: expected an array");
            return;
        }
        for (int i = 0; i < fields.size(); i++) field(fields.get(i), p + ".fields[" + i + "]", issues);

        // cross-field rules, which need every field of the section in scope at once
        Map<String, JsonNode> byKey = new HashMap<>();
        for (JsonNode f : fields) if (f.isObject() && f.path("key").isTextual()) byKey.put(f.get("key").asText(), f);
        for (int i = 0; i < fields.size(); i++) {
            JsonNode f = fields.get(i);
            if (!f.isObject()) continue;
            String fp = p + ".fields[" + i + "]";
            String key = f.path("key").asText();
            JsonNode options = f.get("options");
            if (options != null && options.isArray()) {
                Set<String> seen = new HashSet<>();
                for (int o = 0; o < options.size(); o++) {
                    String v = options.get(o).path("value").asText("");
                    if (v.isEmpty()) issues.add(fp + ".options[" + o + "].value: Field '" + key + "': option value must not be empty");
                    else if (!seen.add(v)) issues.add(fp + ".options[" + o + "].value: Field '" + key + "': duplicate option value '" + v + "'");
                }
            }
            JsonNode dep = f.get("optionsDependOn");
            if (dep != null && dep.isObject() && dep.path("fieldKey").isTextual()) {
                JsonNode trigger = byKey.get(dep.get("fieldKey").asText());
                if (trigger == null) {
                    issues.add(fp + ".optionsDependOn.fieldKey: Field '" + key + "': optionsDependOn references unknown field '" + dep.get("fieldKey").asText() + "'");
                } else if (trigger.path("order").asDouble() >= f.path("order").asDouble()) {
                    issues.add(fp + ".optionsDependOn.fieldKey: Field '" + key + "': optionsDependOn field '" + trigger.path("key").asText() + "' must come before it in display order");
                }
            }
        }
    }

    private void header(JsonNode h, String p, List<String> issues) {
        if (!obj(h, p, issues)) return;
        strictKeys(h, p, Set.of("key", "labelKey", "label", "order"), issues);
        str(h, "key", p, true, issues);
        str(h, "labelKey", p, false, issues);
        bilingual(h.get("label"), p + ".label", issues);
        num(h, "order", p, true, issues);
        if (!hasLabel(h)) issues.add(p + ".label: a section header needs either labelKey or an inline label");
    }

    private static boolean hasLabel(JsonNode n) {
        return (n.path("labelKey").isTextual() && !n.get("labelKey").asText().isEmpty()) || (n.has("label") && !n.get("label").isNull());
    }

    private void field(JsonNode f, String p, List<String> issues) {
        if (!obj(f, p, issues)) return;
        strictKeys(f, p, Set.of("key", "sectionHeaderKey", "kind", "type", "labelKey", "label", "helpText", "tooltip", "required",
                "hidden", "order", "options", "optionsDependOn", "validation", "visibility", "errorMessage", "successMessage",
                "warningMessage"), issues);
        str(f, "key", p, true, issues);
        str(f, "sectionHeaderKey", p, true, issues);
        String kind = f.path("kind").asText("");
        if (!kind.equals("existing") && !kind.equals("custom")) issues.add(p + ".kind: expected 'existing' or 'custom'");
        if (f.has("type") && (!f.get("type").isTextual() || !FIELD_TYPES.contains(f.get("type").asText()))) {
            issues.add(p + ".type: expected one of " + new TreeSet<>(FIELD_TYPES));
        }
        str(f, "labelKey", p, false, issues);
        for (String k : List.of("label", "helpText", "tooltip", "errorMessage", "successMessage", "warningMessage")) {
            bilingual(f.get(k), p + "." + k, issues);
        }
        if (!f.path("required").isBoolean()) issues.add(p + ".required: expected a boolean");
        if (f.has("hidden") && !f.get("hidden").isBoolean()) issues.add(p + ".hidden: expected a boolean");
        num(f, "order", p, true, issues);

        JsonNode options = f.get("options");
        if (options != null) {
            if (!options.isArray()) issues.add(p + ".options: expected an array");
            else for (int i = 0; i < options.size(); i++) {
                JsonNode o = options.get(i);
                String op = p + ".options[" + i + "]";
                if (!obj(o, op, issues)) continue;
                strictKeys(o, op, Set.of("value", "label"), issues);
                str(o, "value", op, true, issues);
                if (!o.has("label")) issues.add(op + ".label: required");
                else bilingual(o.get("label"), op + ".label", issues);
            }
        }
        JsonNode dep = f.get("optionsDependOn");
        if (dep != null) {
            String dp = p + ".optionsDependOn";
            if (obj(dep, dp, issues)) {
                strictKeys(dep, dp, Set.of("fieldKey", "map"), issues);
                str(dep, "fieldKey", dp, true, issues);
                JsonNode map = dep.get("map");
                if (map == null || !map.isObject()) issues.add(dp + ".map: expected an object");
                else map.fields().forEachRemaining(e -> {
                    JsonNode arr = e.getValue();
                    if (!arr.isArray() || !allMatch(arr, JsonNode::isTextual)) issues.add(dp + ".map." + e.getKey() + ": expected an array of strings");
                });
            }
        }
        JsonNode validation = f.get("validation");
        if (validation != null) {
            String vp = p + ".validation";
            if (obj(validation, vp, issues)) {
                strictKeys(validation, vp, Set.of("min", "max", "minLength", "maxLength", "pattern"), issues);
                for (String k : List.of("min", "max", "minLength", "maxLength")) num(validation, k, vp, false, issues);
                str(validation, "pattern", vp, false, issues);
            }
        }
        JsonNode vis = f.get("visibility");
        if (vis != null && !vis.isNull()) visibility(vis, p + ".visibility", issues);

        if (kind.equals("custom") && !(f.has("type") && f.get("type").isTextual() && !f.get("type").asText().isEmpty())) {
            issues.add(p + ".type: custom fields must declare a type");
        }
        if (!hasLabel(f)) issues.add(p + ".label: a field needs either labelKey (existing i18n key) or an inline label");
    }

    private void visibility(JsonNode n, String p, List<String> issues) {
        if (!obj(n, p, issues)) return;
        if (!n.has("kind")) { // legacy single same-section equality rule
            strictKeys(n, p, Set.of("fieldKey", "op", "value"), issues);
            str(n, "fieldKey", p, true, issues);
            String op = n.path("op").asText("");
            if (!op.equals("equals") && !op.equals("notEquals")) issues.add(p + ".op: expected 'equals' or 'notEquals'");
            if (!scalarValue(n.get("value"))) issues.add(p + ".value: expected a string, number or boolean");
        } else if (n.path("kind").asText().equals("group")) {
            strictKeys(n, p, Set.of("kind", "op", "conditions"), issues);
            String op = n.path("op").asText("");
            if (!op.equals("and") && !op.equals("or")) issues.add(p + ".op: expected 'and' or 'or'");
            JsonNode conds = n.get("conditions");
            if (conds == null || !conds.isArray() || conds.isEmpty()) issues.add(p + ".conditions: expected a non-empty array");
            else for (int i = 0; i < conds.size(); i++) {
                JsonNode c = conds.get(i);
                if (c.isObject() && (c.path("kind").asText().equals("condition") || c.path("kind").asText().equals("group"))) {
                    visibility(c, p + ".conditions[" + i + "]", issues);
                } else issues.add(p + ".conditions[" + i + "]: expected a condition or a group");
            }
        } else if (n.path("kind").asText().equals("condition")) {
            strictKeys(n, p, Set.of("kind", "left", "op", "right"), issues);
            operand(n.get("left"), p + ".left", issues);
            String op = n.path("op").asText("");
            if (COMPARISON_OPS.contains(op)) operand(n.get("right"), p + ".right", issues);
            else if (MEMBERSHIP_OPS.contains(op)) listOperand(n.get("right"), p + ".right", issues);
            else issues.add(p + ".op: unknown operator '" + op + "'");
        } else {
            issues.add(p + ".kind: expected 'condition' or 'group'");
        }
    }

    private void operand(JsonNode n, String p, List<String> issues) {
        if (n == null || !obj(n, p, issues)) { if (n == null) issues.add(p + ": required"); return; }
        switch (n.path("kind").asText("")) {
            case "literal" -> {
                strictKeys(n, p, Set.of("kind", "value"), issues);
                if (!scalarValue(n.get("value"))) issues.add(p + ".value: expected a string, number or boolean");
            }
            case "field" -> {
                strictKeys(n, p, Set.of("kind", "sectionKey", "fieldKey"), issues);
                str(n, "sectionKey", p, true, issues);
                str(n, "fieldKey", p, true, issues);
            }
            case "constant" -> {
                strictKeys(n, p, Set.of("kind", "key"), issues);
                str(n, "key", p, true, issues);
            }
            case "computed" -> {
                strictKeys(n, p, Set.of("kind", "fn", "dateField", "offsetField", "offsetUnit"), issues);
                if (!n.path("fn").asText("").equals("age")) issues.add(p + ".fn: expected 'age'");
                fieldRef(n.get("dateField"), p + ".dateField", true, issues);
                fieldRef(n.get("offsetField"), p + ".offsetField", false, issues);
                if (n.has("offsetUnit") && !List.of("months", "years").contains(n.get("offsetUnit").asText())) {
                    issues.add(p + ".offsetUnit: expected 'months' or 'years'");
                }
            }
            default -> issues.add(p + ".kind: unknown operand kind");
        }
    }

    private void listOperand(JsonNode n, String p, List<String> issues) {
        if (n == null || !n.isObject() || !n.path("kind").asText("").equals("list")) { issues.add(p + ": expected a list operand"); return; }
        strictKeys(n, p, Set.of("kind", "values"), issues);
        JsonNode values = n.get("values");
        if (values == null || !values.isArray() || !allMatch(values, v -> v.isTextual() || v.isNumber())) {
            issues.add(p + ".values: expected an array of strings or numbers");
        }
    }

    private void fieldRef(JsonNode n, String p, boolean required, List<String> issues) {
        if (n == null) { if (required) issues.add(p + ": required"); return; }
        if (!obj(n, p, issues)) return;
        strictKeys(n, p, Set.of("sectionKey", "fieldKey"), issues);
        str(n, "sectionKey", p, true, issues);
        str(n, "fieldKey", p, true, issues);
    }

    private void bilingual(JsonNode n, String p, List<String> issues) {
        if (n == null) return;
        if (!obj(n, p, issues)) return;
        strictKeys(n, p, Set.of("en", "he"), issues);
        str(n, "en", p, true, issues);
        str(n, "he", p, true, issues);
    }

    // --- helpers ---

    private static boolean scalarValue(JsonNode v) {
        return v != null && (v.isTextual() || v.isNumber() || v.isBoolean());
    }

    private static boolean allMatch(JsonNode arr, java.util.function.Predicate<JsonNode> test) {
        for (JsonNode e : arr) if (!test.test(e)) return false;
        return true;
    }

    private static boolean obj(JsonNode n, String p, List<String> issues) {
        if (n == null || !n.isObject()) {
            issues.add(p + ": expected an object");
            return false;
        }
        return true;
    }

    private static void strictKeys(JsonNode n, String p, Set<String> allowed, List<String> issues) {
        n.fieldNames().forEachRemaining(k -> {
            if (!allowed.contains(k)) issues.add(p + ": unrecognized key '" + k + "'");
        });
    }

    private static void str(JsonNode n, String key, String p, boolean required, List<String> issues) {
        JsonNode v = n.get(key);
        if (v == null) { if (required) issues.add(p + "." + key + ": required"); return; }
        if (!v.isTextual()) issues.add(p + "." + key + ": expected a string");
    }

    private static void num(JsonNode n, String key, String p, boolean required, List<String> issues) {
        JsonNode v = n.get(key);
        if (v == null) { if (required) issues.add(p + "." + key + ": required"); return; }
        if (!v.isNumber()) issues.add(p + "." + key + ": expected a number");
    }
}
