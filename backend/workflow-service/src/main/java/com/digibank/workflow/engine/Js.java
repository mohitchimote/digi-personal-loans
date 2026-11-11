package com.digibank.workflow.engine;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Small helpers that give the engine JavaScript-like semantics over generic JSON trees (Map, List,
 * String, Number, Boolean, null), so the Java engine behaves exactly like the Worker's on the shared
 * conformance vectors. The engine works on plain trees, not generated classes, because a definition is
 * data and the results are returned to callers as JSON.
 */
public final class Js {
    private Js() {}

    /** A path that does not exist (JavaScript's undefined, distinct from an explicit null). */
    public static final Object UNDEFINED = new Object() {
        @Override public String toString() { return "undefined"; }
    };

    @SuppressWarnings("unchecked")
    public static Map<String, Object> map(Object o) {
        return o instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
    }

    @SuppressWarnings("unchecked")
    public static List<Object> list(Object o) {
        return o instanceof List<?> l ? (List<Object>) l : null;
    }

    public static List<Object> listOrEmpty(Object o) {
        List<Object> l = list(o);
        return l == null ? List.of() : l;
    }

    public static String str(Object o) {
        return o instanceof String s ? s : null;
    }

    public static LinkedHashMap<String, Object> obj(Object... kv) {
        LinkedHashMap<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    /** JavaScript truthiness. */
    public static boolean truthy(Object v) {
        if (v == null || v == UNDEFINED) return false;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.doubleValue() != 0 && !Double.isNaN(n.doubleValue());
        if (v instanceof String s) return !s.isEmpty();
        return true;
    }

    /** JavaScript strict equality (numbers compare by value, undefined is not null). */
    public static boolean strictEq(Object a, Object b) {
        if (a == UNDEFINED || b == UNDEFINED) return a == b;
        if (a == null || b == null) return a == b;
        if (a instanceof Number x && b instanceof Number y) return x.doubleValue() == y.doubleValue();
        return a.equals(b);
    }

    /** JavaScript String(v) for the value kinds a definition can carry. */
    public static String text(Object v) {
        if (v == null) return "null";
        if (v instanceof Number n) return num(n.doubleValue());
        return String.valueOf(v);
    }

    public static String num(double d) {
        if (Double.isNaN(d)) return "NaN";
        if (d == Math.rint(d) && Math.abs(d) < 1e15) return Long.toString((long) d);
        return Double.toString(d);
    }

    /** Reads a dotted path from nested maps; missing parts give UNDEFINED. */
    public static Object path(Object root, String path) {
        Object cur = root;
        for (String part : path.split("\\.", -1)) {
            if (!(cur instanceof Map<?, ?> m)) return UNDEFINED;
            if (!m.containsKey(part)) return UNDEFINED;
            cur = m.get(part);
        }
        return cur;
    }

    /** Number(v) as JavaScript would compute it for numbers and numeric strings; NaN otherwise. */
    public static double toNumber(Object v) {
        if (v instanceof Number n) return n.doubleValue();
        if (v instanceof String s) {
            String t = s.trim();
            if (t.isEmpty()) return 0;
            try { return Double.parseDouble(t); } catch (NumberFormatException e) { return Double.NaN; }
        }
        if (v instanceof Boolean b) return b ? 1 : 0;
        if (v == null) return 0;
        return Double.NaN;
    }

    /** Deep copy of a JSON tree, so engine results never alias their inputs. */
    public static Object copy(Object o) {
        if (o instanceof Map<?, ?> m) {
            LinkedHashMap<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : m.entrySet()) out.put((String) e.getKey(), copy(e.getValue()));
            return out;
        }
        if (o instanceof List<?> l) {
            List<Object> out = new ArrayList<>();
            for (Object x : l) out.add(copy(x));
            return out;
        }
        return o;
    }

    /** JSON.stringify for trees (compact), used where the Worker greps a serialised form. */
    public static String stringify(Object o) {
        StringBuilder sb = new StringBuilder();
        write(sb, o);
        return sb.toString();
    }

    private static void write(StringBuilder sb, Object o) {
        if (o == null) sb.append("null");
        else if (o instanceof String s) quote(sb, s);
        else if (o instanceof Number n) sb.append(num(n.doubleValue()));
        else if (o instanceof Boolean b) sb.append(b);
        else if (o instanceof Map<?, ?> m) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!first) sb.append(',');
                first = false;
                quote(sb, String.valueOf(e.getKey()));
                sb.append(':');
                write(sb, e.getValue());
            }
            sb.append('}');
        } else if (o instanceof List<?> l) {
            sb.append('[');
            for (int i = 0; i < l.size(); i++) {
                if (i > 0) sb.append(',');
                write(sb, l.get(i));
            }
            sb.append(']');
        } else quote(sb, String.valueOf(o));
    }

    private static void quote(StringBuilder sb, String s) {
        sb.append('"');
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> sb.append(c);
            }
        }
        sb.append('"');
    }
}
