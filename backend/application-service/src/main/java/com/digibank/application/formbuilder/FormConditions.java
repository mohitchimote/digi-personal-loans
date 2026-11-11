package com.digibank.application.formbuilder;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

/**
 * The field visibility condition engine, a port of isFieldVisible and its helpers in
 * worker/src/lib/form-schema-types.ts. A field's visibility is a legacy same-section equality rule, a
 * single condition, or an AND/OR group. An operand that cannot be resolved (a field not answered yet,
 * an unknown constant) makes the condition false, never an error.
 */
public final class FormConditions {

    private FormConditions() {}

    /** @param constants the schema's named constants (array of {key,label,value}), may be null
     *  @param values flat map keyed "sectionKey.fieldKey" */
    public record Context(JsonNode constants, Map<String, Object> values) {}

    public static boolean isFieldVisible(JsonNode field, String currentSectionKey, Context ctx) {
        JsonNode vis = field.get("visibility");
        if (vis == null || vis.isNull()) return true;
        return evaluate(vis, currentSectionKey, ctx);
    }

    private static boolean evaluate(JsonNode node, String sectionKey, Context ctx) {
        if (!node.has("kind")) { // legacy rule: bare fieldKey means "same section as the field carrying it"
            Object left = ctx.values().get(sectionKey + "." + node.path("fieldKey").asText());
            return compare(node.path("op").asText(), left, value(node.get("value")));
        }
        if (node.path("kind").asText().equals("group")) {
            boolean and = node.path("op").asText().equals("and");
            boolean result = and;
            for (JsonNode c : node.get("conditions")) {
                boolean r = evaluate(c, sectionKey, ctx);
                if (and) result &= r; else result |= r;
            }
            return result;
        }
        Object left = operand(node.get("left"), ctx);
        String op = node.path("op").asText();
        if (op.equals("in") || op.equals("notIn")) {
            if (left == null) return false;
            boolean found = false;
            for (JsonNode v : node.path("right").path("values")) if (str(value(v)).equals(str(left))) found = true;
            return op.equals("in") == found;
        }
        return compare(op, left, operand(node.get("right"), ctx));
    }

    private static boolean compare(String op, Object left, Object right) {
        if (left == null || right == null) return false;
        return switch (op) {
            case "equals" -> strictEquals(left, right);
            case "notEquals" -> !strictEquals(left, right);
            case "gt" -> num(left) > num(right);
            case "gte" -> num(left) >= num(right);
            case "lt" -> num(left) < num(right);
            case "lte" -> num(left) <= num(right);
            case "contains" -> str(left).toLowerCase().contains(str(right).toLowerCase());
            default -> false;
        };
    }

    private static Object operand(JsonNode o, Context ctx) {
        return switch (o.path("kind").asText()) {
            case "literal" -> value(o.get("value"));
            case "field" -> ctx.values().get(o.path("sectionKey").asText() + "." + o.path("fieldKey").asText());
            case "constant" -> {
                if (ctx.constants() != null) for (JsonNode c : ctx.constants()) {
                    if (c.path("key").asText().equals(o.path("key").asText())) yield c.get("value").numberValue().doubleValue();
                }
                yield null;
            }
            case "computed" -> age(o, ctx);
            default -> null;
        };
    }

    private static Object age(JsonNode op, Context ctx) {
        JsonNode df = op.get("dateField");
        Object dobRaw = ctx.values().get(df.path("sectionKey").asText() + "." + df.path("fieldKey").asText());
        if (!(dobRaw instanceof String s) || s.isEmpty()) return null;
        LocalDate dob;
        try {
            dob = LocalDate.parse(s.length() >= 10 ? s.substring(0, 10) : s);
        } catch (RuntimeException e) {
            return null;
        }
        Instant asOf = Instant.now();
        JsonNode of = op.get("offsetField");
        if (of != null) {
            Object raw = ctx.values().get(of.path("sectionKey").asText() + "." + of.path("fieldKey").asText());
            if (raw == null || "".equals(raw)) return null;
            double offset;
            try {
                offset = num(raw);
            } catch (RuntimeException e) {
                return null;
            }
            if (Double.isNaN(offset)) return null;
            double days = "years".equals(op.path("offsetUnit").asText()) ? offset * 365.25 : offset * 30.4375;
            asOf = asOf.plusMillis((long) (days * 86_400_000d));
        }
        LocalDate now = asOf.atZone(ZoneOffset.UTC).toLocalDate();
        int age = now.getYear() - dob.getYear();
        boolean hadBirthday = now.getMonthValue() > dob.getMonthValue()
                || (now.getMonthValue() == dob.getMonthValue() && now.getDayOfMonth() >= dob.getDayOfMonth());
        return (double) (hadBirthday ? age : age - 1);
    }

    private static Object value(JsonNode v) {
        if (v == null || v.isNull()) return null;
        if (v.isBoolean()) return v.asBoolean();
        if (v.isNumber()) return v.numberValue().doubleValue();
        return v.asText();
    }

    /** JS === across the JSON scalar types: same type and equal value (all numbers compare as numbers). */
    private static boolean strictEquals(Object a, Object b) {
        if (a instanceof Number x && b instanceof Number y) return x.doubleValue() == y.doubleValue();
        return a.getClass().equals(b.getClass()) && a.equals(b);
    }

    private static double num(Object v) {
        if (v instanceof Number n) return n.doubleValue();
        if (v instanceof Boolean b) return b ? 1 : 0;
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return 0;
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return Double.NaN;
        }
    }

    /** JS String(): whole numbers print without a decimal point. */
    public static String str(Object v) {
        if (v instanceof Number n && n.doubleValue() == Math.rint(n.doubleValue()) && !Double.isInfinite(n.doubleValue())) {
            return String.valueOf((long) n.doubleValue());
        }
        return String.valueOf(v);
    }

    /** For callers that hold a raw JSON array of option values. */
    public static List<String> strings(JsonNode arr) {
        List<String> out = new java.util.ArrayList<>();
        if (arr != null) for (JsonNode e : arr) out.add(e.asText());
        return out;
    }
}
