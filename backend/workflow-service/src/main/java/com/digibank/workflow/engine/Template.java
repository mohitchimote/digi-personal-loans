package com.digibank.workflow.engine;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Template resolution ("{{input.reason}}") and `when` conditions. Same rules as the Worker's
 * template.ts and workflow-spec/README.md: a string that is exactly one placeholder resolves to the
 * typed value (missing gives null); any other string is interpolated as text (null gives empty).
 */
public final class Template {
    private Template() {}

    private static final Pattern WHOLE = Pattern.compile("^\\{\\{([A-Za-z0-9_.]+)\\}\\}$");
    private static final Pattern EACH = Pattern.compile("\\{\\{([A-Za-z0-9_.]+)\\}\\}");

    public static Object resolve(Object value, Map<String, Object> ctx) {
        if (!(value instanceof String s)) return value;
        Matcher whole = WHOLE.matcher(s);
        if (whole.matches()) {
            Object v = Js.path(ctx, whole.group(1));
            return v == Js.UNDEFINED ? null : v;
        }
        Matcher m = EACH.matcher(s);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            Object v = Js.path(ctx, m.group(1));
            m.appendReplacement(out, Matcher.quoteReplacement(v == null || v == Js.UNDEFINED ? "" : Js.text(v)));
        }
        m.appendTail(out);
        return out.toString();
    }

    public static Map<String, Object> resolveVars(Map<String, Object> vars, Map<String, Object> ctx) {
        if (vars == null) return null;
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : vars.entrySet()) out.put(e.getKey(), resolve(e.getValue(), ctx));
        return out;
    }

    public static boolean eval(Map<String, Object> cond, Map<String, Object> ctx) {
        if (cond.containsKey("all")) {
            for (Object c : Js.listOrEmpty(cond.get("all"))) if (!eval(Js.map(c), ctx)) return false;
            return true;
        }
        if (cond.containsKey("any")) {
            for (Object c : Js.listOrEmpty(cond.get("any"))) if (eval(Js.map(c), ctx)) return true;
            return false;
        }
        if (cond.containsKey("not")) return !eval(Js.map(cond.get("not")), ctx);
        Object v = Js.path(ctx, (String) cond.get("fact"));
        Object expected = cond.get("value");
        return switch ((String) cond.get("op")) {
            case "eq" -> Js.strictEq(v, expected);
            case "ne" -> !Js.strictEq(v, expected);
            case "truthy" -> Js.truthy(v);
            case "falsy" -> !Js.truthy(v);
            case "in" -> {
                List<Object> l = Js.list(expected);
                if (l == null) yield false;
                boolean found = false;
                for (Object x : l) if (Js.strictEq(x, v)) { found = true; break; }
                yield found;
            }
            default -> false;
        };
    }
}
