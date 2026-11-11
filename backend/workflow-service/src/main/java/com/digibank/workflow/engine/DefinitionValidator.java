package com.digibank.workflow.engine;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validation for workflow definitions, run on every save and publish. Layer 1 is a strict structural
 * check (mirrors workflow-spec/definition.schema.json and the Worker's zod schema; hand-rolled so no
 * schema library is needed); layer 2 is the cross-reference and graph checks a schema cannot express.
 * Bad definitions never reach a case. Port of the Worker's validate.ts.
 */
public final class DefinitionValidator {
    private DefinitionValidator() {}

    public record Result(boolean ok, List<String> errors) {}

    private static final Pattern KEY = Pattern.compile("^[A-Za-z][A-Za-z0-9_-]{0,63}$");
    private static final Pattern EVENT_RE = Pattern.compile("^[a-z][A-Za-z0-9]*(\\.[a-z][A-Za-z0-9_]*)+$");
    private static final Pattern ENTITLEMENT_RE = Pattern.compile("^[a-z]+\\.[A-Za-z]+$");
    private static final Pattern ICON_RE = Pattern.compile("^[a-z][a-z0-9_]*$");
    private static final Pattern FACT_RE = Pattern.compile("^(input|case|actor|target)\\.[A-Za-z0-9_.]+$");

    private static final Set<String> SET_FIELDS = Set.copyOf(Catalog.SET_FIELDS);

    // ------------------------------------------------------------------ layer 1: structure

    private static final class S {
        final List<String> errors = new ArrayList<>();
        void err(String path, String msg) { errors.add((path.isEmpty() ? "(root)" : path) + ": " + msg); }

        /** Checks a value is an object whose keys are within required+optional, and required are present. */
        Map<String, Object> object(String path, Object v, List<String> required, List<String> optional) {
            Map<String, Object> m = Js.map(v);
            if (m == null) { err(path, "Expected object"); return null; }
            for (String r : required) if (!m.containsKey(r)) err(join(path, r), "Required");
            for (String k : m.keySet()) if (!required.contains(k) && !optional.contains(k)) err(path, "Unrecognized key: \"" + k + "\"");
            return m;
        }

        String key(String path, Object v) {
            if (v instanceof String s && KEY.matcher(s).matches()) return s;
            err(path, "Invalid key (letters, digits, - and _, starting with a letter)");
            return null;
        }

        void string(String path, Object v) { if (!(v instanceof String)) err(path, "Expected string"); }

        void nonEmptyString(String path, Object v) { if (!(v instanceof String s) || s.isEmpty()) err(path, "Expected non-empty string"); }

        void bool(String path, Object v) { if (!(v instanceof Boolean)) err(path, "Expected boolean"); }

        void oneOf(String path, Object v, Set<String> allowed) {
            if (!(v instanceof String s) || !allowed.contains(s)) err(path, "Invalid enum value. Expected " + allowed);
        }

        List<Object> array(String path, Object v, int min) {
            List<Object> l = Js.list(v);
            if (l == null) { err(path, "Expected array"); return null; }
            if (l.size() < min) err(path, "Array must contain at least " + min + " element(s)");
            return l;
        }

        void label(String path, Object v) {
            Map<String, Object> m = object(path, v, List.of("en", "he"), List.of());
            if (m == null) return;
            nonEmptyString(join(path, "en"), m.get("en"));
            nonEmptyString(join(path, "he"), m.get("he"));
        }

        void vars(String path, Object v) {
            if (v == null) return;
            Map<String, Object> m = Js.map(v);
            if (m == null) { err(path, "Expected object"); return; }
            for (Map.Entry<String, Object> e : m.entrySet()) {
                Object x = e.getValue();
                if (!(x == null || x instanceof String || x instanceof Number || x instanceof Boolean)) err(join(path, e.getKey()), "Invalid value");
            }
        }

        void condition(String path, Object v) {
            Map<String, Object> m = Js.map(v);
            if (m == null) { err(path, "Expected object"); return; }
            if (m.containsKey("fact")) {
                object(path, m, List.of("fact", "op"), List.of("value"));
                if (!(m.get("fact") instanceof String f) || !FACT_RE.matcher(f).matches()) err(join(path, "fact"), "Invalid fact path");
                oneOf(join(path, "op"), m.get("op"), Set.of("eq", "ne", "truthy", "falsy", "in"));
            } else if (m.containsKey("all") || m.containsKey("any")) {
                String k = m.containsKey("all") ? "all" : "any";
                object(path, m, List.of(k), List.of());
                List<Object> l = array(join(path, k), m.get(k), 1);
                if (l != null) for (int i = 0; i < l.size(); i++) condition(path + "." + k + "." + i, l.get(i));
            } else if (m.containsKey("not")) {
                object(path, m, List.of("not"), List.of());
                condition(join(path, "not"), m.get("not"));
            } else err(path, "Invalid condition");
        }

        void guard(String path, Object v) {
            Map<String, Object> m = Js.map(v);
            if (m == null) { err(path, "Expected object"); return; }
            Object type = m.get("type");
            if (!(type instanceof String t) || !Catalog.GUARDS.contains(t)) { err(join(path, "type"), "Invalid guard type"); return; }
            switch (t) {
                case "REFERRAL_LOCK" -> { object(path, m, List.of("type", "status"), List.of()); key(join(path, "status"), m.get("status")); }
                case "AMOUNT_POSITIVE" -> { object(path, m, List.of("type", "field"), List.of()); string(join(path, "field"), m.get("field")); }
                case "MANDATE" -> { object(path, m, List.of("type", "amountField"), List.of()); string(join(path, "amountField"), m.get("amountField")); }
                case "TRACK_STATUS_IS" -> {
                    object(path, m, List.of("type", "track", "statuses"), List.of());
                    key(join(path, "track"), m.get("track"));
                    List<Object> l = array(join(path, "statuses"), m.get("statuses"), 1);
                    if (l != null) for (int i = 0; i < l.size(); i++) key(path + ".statuses." + i, l.get(i));
                }
                default -> object(path, m, List.of("type"), List.of());
            }
        }

        void effect(String path, Object v) {
            Map<String, Object> m = Js.map(v);
            if (m == null) { err(path, "Expected object"); return; }
            Object type = m.get("type");
            if (!(type instanceof String t) || !Catalog.EFFECTS.contains(t)) { err(join(path, "type"), "Invalid effect type"); return; }
            switch (t) {
                case "SET" -> {
                    object(path, m, List.of("type", "field"), List.of("value", "when"));
                    oneOf(join(path, "field"), m.get("field"), SET_FIELDS);
                }
                case "REFERRAL_OPEN" -> { object(path, m, List.of("type", "toRole"), List.of("when")); string(join(path, "toRole"), m.get("toRole")); }
                case "NOTE" -> {
                    object(path, m, List.of("type", "noteType", "section", "text"), List.of("when"));
                    for (String f : List.of("noteType", "section", "text")) string(join(path, f), m.get(f));
                }
                case "NOTIFY" -> { object(path, m, List.of("type", "template"), List.of("vars", "when")); string(join(path, "template"), m.get("template")); vars(join(path, "vars"), m.get("vars")); }
                case "EMAIL" -> { object(path, m, List.of("type", "event"), List.of("vars", "when")); string(join(path, "event"), m.get("event")); vars(join(path, "vars"), m.get("vars")); }
                case "GENERATE_DOC" -> { object(path, m, List.of("type", "doc"), List.of("when")); oneOf(join(path, "doc"), m.get("doc"), Set.of("APPROVAL_LETTER")); }
                case "CARD_PAYMENT" -> { object(path, m, List.of("type", "mode"), List.of("when")); oneOf(join(path, "mode"), m.get("mode"), Set.of("AUTHORISE")); }
                default -> object(path, m, List.of("type"), List.of("when"));
            }
            if (m.containsKey("when")) condition(join(path, "when"), m.get("when"));
        }

        void stage(String path, Object v) {
            Map<String, Object> m = object(path, v, List.of("key", "label"), List.of("owner", "sla", "routing"));
            if (m == null) return;
            key(join(path, "key"), m.get("key"));
            label(join(path, "label"), m.get("label"));
            if (m.containsKey("owner")) {
                Map<String, Object> o = object(join(path, "owner"), m.get("owner"), List.of(), List.of("roles", "unitRule"));
                if (o != null) {
                    if (o.containsKey("roles")) {
                        List<Object> l = array(path + ".owner.roles", o.get("roles"), 0);
                        if (l != null) for (int i = 0; i < l.size(); i++) string(path + ".owner.roles." + i, l.get(i));
                    }
                    if (o.containsKey("unitRule")) oneOf(path + ".owner.unitRule", o.get("unitRule"), Set.of("ANY", "CASE_UNIT", "CASE_UNIT_OR_ANCESTOR"));
                }
            }
            if (m.containsKey("sla")) {
                Map<String, Object> s = object(join(path, "sla"), m.get("sla"), List.of("hours"), List.of("amberAtPercent"));
                if (s != null) {
                    if (!(s.get("hours") instanceof Number h) || h.doubleValue() <= 0) err(path + ".sla.hours", "Must be greater than 0");
                    if (s.containsKey("amberAtPercent") && (!(s.get("amberAtPercent") instanceof Number a) || a.doubleValue() < 1 || a.doubleValue() > 100)) {
                        err(path + ".sla.amberAtPercent", "Must be between 1 and 100");
                    }
                }
            }
            if (m.containsKey("routing")) {
                Map<String, Object> r = object(join(path, "routing"), m.get("routing"), List.of("mode"), List.of());
                if (r != null) oneOf(path + ".routing.mode", r.get("mode"), Set.of("MANUAL", "ROUND_ROBIN", "LEAST_LOADED"));
            }
        }

        void status(String path, Object v) {
            Map<String, Object> m = object(path, v, List.of("key", "stage", "category", "badge", "label"), List.of());
            if (m == null) return;
            key(join(path, "key"), m.get("key"));
            if (m.get("stage") != null) key(join(path, "stage"), m.get("stage"));
            oneOf(join(path, "category"), m.get("category"), Set.of("DRAFT", "WAITING_CUSTOMER", "ACTIVE", "TERMINAL"));
            oneOf(join(path, "badge"), m.get("badge"), Set.of("draft", "in-progress", "review", "approved", "declined"));
            label(join(path, "label"), m.get("label"));
        }

        void transition(String path, Object v) {
            Map<String, Object> m = object(path, v, List.of("key", "label", "actors", "from", "guards", "effects"),
                    List.of("entitlement", "event", "ui", "to"));
            if (m == null) return;
            key(join(path, "key"), m.get("key"));
            label(join(path, "label"), m.get("label"));
            List<Object> actors = array(join(path, "actors"), m.get("actors"), 1);
            if (actors != null) for (int i = 0; i < actors.size(); i++) oneOf(path + ".actors." + i, actors.get(i), Set.of("CUSTOMER", "STAFF", "SYSTEM"));
            if (m.containsKey("entitlement") && !(m.get("entitlement") instanceof String e && ENTITLEMENT_RE.matcher(e).matches())) {
                err(join(path, "entitlement"), "Invalid entitlement key");
            }
            if (m.containsKey("event") && !(m.get("event") instanceof String e && EVENT_RE.matcher(e).matches())) {
                err(join(path, "event"), "Invalid event name");
            }
            if (m.containsKey("ui")) {
                Map<String, Object> ui = object(join(path, "ui"), m.get("ui"), List.of(), List.of("area", "style", "icon", "after"));
                if (ui != null) {
                    if (ui.containsKey("area")) oneOf(path + ".ui.area", ui.get("area"), Set.of("decision", "disbursement", "general"));
                    if (ui.containsKey("style")) oneOf(path + ".ui.style", ui.get("style"), Set.of("primary", "secondary", "danger"));
                    if (ui.containsKey("icon") && !(ui.get("icon") instanceof String i && ICON_RE.matcher(i).matches())) err(path + ".ui.icon", "Invalid icon name");
                    if (ui.containsKey("after")) oneOf(path + ".ui.after", ui.get("after"), Set.of("pipeline"));
                }
            }
            List<Object> from = array(join(path, "from"), m.get("from"), 1);
            if (from != null) for (int i = 0; i < from.size(); i++) string(path + ".from." + i, from.get(i));
            if (m.containsKey("to")) key(join(path, "to"), m.get("to"));
            List<Object> guards = array(join(path, "guards"), m.get("guards"), 0);
            if (guards != null) for (int i = 0; i < guards.size(); i++) guard(path + ".guards." + i, guards.get(i));
            List<Object> effects = array(join(path, "effects"), m.get("effects"), 0);
            if (effects != null) for (int i = 0; i < effects.size(); i++) effect(path + ".effects." + i, effects.get(i));
        }

        void track(String path, Object v) {
            Map<String, Object> m = object(path, v, List.of("key", "label", "statuses", "transitions"), List.of("entryPoints", "initialStatus"));
            if (m == null) return;
            key(join(path, "key"), m.get("key"));
            label(join(path, "label"), m.get("label"));
            if (m.containsKey("entryPoints")) {
                List<Object> eps = array(join(path, "entryPoints"), m.get("entryPoints"), 0);
                if (eps != null) for (int i = 0; i < eps.size(); i++) {
                    String p = path + ".entryPoints." + i;
                    Map<String, Object> e = object(p, eps.get(i), List.of("key", "status"), List.of());
                    if (e != null) { key(join(p, "key"), e.get("key")); key(join(p, "status"), e.get("status")); }
                }
            }
            if (m.containsKey("initialStatus")) key(join(path, "initialStatus"), m.get("initialStatus"));
            List<Object> sts = array(join(path, "statuses"), m.get("statuses"), 1);
            if (sts != null) for (int i = 0; i < sts.size(); i++) status(path + ".statuses." + i, sts.get(i));
            List<Object> trs = array(join(path, "transitions"), m.get("transitions"), 0);
            if (trs != null) for (int i = 0; i < trs.size(); i++) transition(path + ".transitions." + i, trs.get(i));
        }

        void queue(String path, Object v) {
            Map<String, Object> m = object(path, v, List.of("key", "label", "track", "statuses", "requiresEntitlement", "applyScope", "hideReferredAbove"),
                    List.of("requiresAlso", "excludesEntitlement"));
            if (m == null) return;
            key(join(path, "key"), m.get("key"));
            label(join(path, "label"), m.get("label"));
            key(join(path, "track"), m.get("track"));
            List<Object> sts = array(join(path, "statuses"), m.get("statuses"), 1);
            if (sts != null) for (int i = 0; i < sts.size(); i++) key(path + ".statuses." + i, sts.get(i));
            string(join(path, "requiresEntitlement"), m.get("requiresEntitlement"));
            if (m.containsKey("requiresAlso")) string(join(path, "requiresAlso"), m.get("requiresAlso"));
            if (m.containsKey("excludesEntitlement")) string(join(path, "excludesEntitlement"), m.get("excludesEntitlement"));
            bool(join(path, "applyScope"), m.get("applyScope"));
            bool(join(path, "hideReferredAbove"), m.get("hideReferredAbove"));
        }

        void definition(Object raw) {
            Map<String, Object> m = object("", raw, List.of("formatVersion", "key", "name", "stages", "tracks", "queues"), List.of("appliesTo"));
            if (m == null) return;
            if (!(m.get("formatVersion") instanceof Number n) || n.doubleValue() != 1) err("formatVersion", "Invalid literal value, expected 1");
            key("key", m.get("key"));
            label("name", m.get("name"));
            if (m.containsKey("appliesTo")) {
                Map<String, Object> a = object("appliesTo", m.get("appliesTo"), List.of(), List.of("applicationTypes"));
                if (a != null && a.containsKey("applicationTypes")) {
                    List<Object> l = array("appliesTo.applicationTypes", a.get("applicationTypes"), 1);
                    if (l != null) for (int i = 0; i < l.size(); i++) oneOf("appliesTo.applicationTypes." + i, l.get(i), Set.of("PERSONAL", "BUSINESS"));
                }
            }
            List<Object> stages = array("stages", m.get("stages"), 1);
            if (stages != null) for (int i = 0; i < stages.size(); i++) stage("stages." + i, stages.get(i));
            List<Object> tracks = array("tracks", m.get("tracks"), 1);
            if (tracks != null) for (int i = 0; i < tracks.size(); i++) track("tracks." + i, tracks.get(i));
            List<Object> queues = array("queues", m.get("queues"), 0);
            if (queues != null) for (int i = 0; i < queues.size(); i++) queue("queues." + i, queues.get(i));
        }

        private static String join(String path, String k) { return path.isEmpty() ? k : path + "." + k; }
    }

    // ------------------------------------------------------------------ layer 2: cross-references

    private static void dupes(List<String> keys, String what, List<String> errors) {
        Set<String> seen = new HashSet<>();
        for (String k : keys) {
            if (!seen.add(k)) errors.add("Duplicate " + what + ": " + k);
        }
    }

    private static boolean containsText(Object o, String needle) {
        if (o instanceof String s) return s.contains(needle);
        if (o instanceof Map<?, ?> m) {
            for (Map.Entry<?, ?> e : m.entrySet()) if (String.valueOf(e.getKey()).contains(needle) || containsText(e.getValue(), needle)) return true;
        }
        if (o instanceof List<?> l) for (Object x : l) if (containsText(x, needle)) return true;
        return false;
    }

    private static List<Map<String, Object>> maps(Object o) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object x : Js.listOrEmpty(o)) out.add(Js.map(x));
        return out;
    }

    private static List<String> strings(Object o) {
        List<String> out = new ArrayList<>();
        for (Object x : Js.listOrEmpty(o)) out.add((String) x);
        return out;
    }

    /** Validates a raw definition tree. On success the (unchanged) tree is returned by the caller. */
    public static Result validate(Object raw, List<String> entitlementKeys) {
        S s = new S();
        s.definition(raw);
        if (!s.errors.isEmpty()) return new Result(false, s.errors);

        Map<String, Object> def = Js.map(raw);
        List<String> errors = new ArrayList<>();
        Set<String> ents = new HashSet<>(entitlementKeys);
        List<Map<String, Object>> stages = maps(def.get("stages"));
        List<Map<String, Object>> tracks = maps(def.get("tracks"));
        List<Map<String, Object>> queues = maps(def.get("queues"));
        Set<String> stageKeys = new HashSet<>();
        for (Map<String, Object> st : stages) stageKeys.add((String) st.get("key"));

        dupes(stages.stream().map(x -> (String) x.get("key")).toList(), "stage", errors);
        dupes(tracks.stream().map(x -> (String) x.get("key")).toList(), "track", errors);
        dupes(queues.stream().map(x -> (String) x.get("key")).toList(), "queue", errors);
        List<String> allKeys = new ArrayList<>();
        List<String> allEvents = new ArrayList<>();
        List<String> allEntries = new ArrayList<>();
        for (Map<String, Object> t : tracks) {
            for (Map<String, Object> x : maps(t.get("transitions"))) {
                allKeys.add((String) x.get("key"));
                allEvents.add(Engine.eventOf((String) t.get("key"), x));
            }
            for (Map<String, Object> e : maps(t.get("entryPoints"))) allEntries.add((String) e.get("key"));
        }
        dupes(allKeys, "transition key (keys are unique across all tracks)", errors);
        dupes(allEvents, "event (each action emits its own event; names are unique across all tracks)", errors);
        // An action without an explicit event gets "<track>.<action key>", written to the audit trail like any
        // other, so that default has to be a valid event name too.
        for (Map<String, Object> t : tracks) {
            for (Map<String, Object> x : maps(t.get("transitions"))) {
                String ev = Engine.eventOf((String) t.get("key"), x);
                if (x.get("event") == null && !EVENT_RE.matcher(ev).matches()) {
                    errors.add("action " + x.get("key") + " (track " + t.get("key") + "): its default event \"" + ev
                            + "\" is not a valid event name. It is built from the track key and the action key, so set an explicit event on the action (lowercase words separated by dots, e.g. case.approved)");
                }
            }
        }
        dupes(allEntries, "entry point", errors);

        for (Map<String, Object> t : tracks) {
            String tk = (String) t.get("key");
            List<Map<String, Object>> statuses = maps(t.get("statuses"));
            Set<String> statusKeys = new HashSet<>();
            for (Map<String, Object> st : statuses) statusKeys.add((String) st.get("key"));
            dupes(statuses.stream().map(x -> (String) x.get("key")).toList(), "status in " + tk, errors);
            for (Map<String, Object> st : statuses) {
                String stage = Js.str(st.get("stage"));
                if (stage != null && !stageKeys.contains(stage)) errors.add(tk + "." + st.get("key") + ": unknown stage " + stage);
            }
            for (Map<String, Object> e : maps(t.get("entryPoints"))) {
                if (!statusKeys.contains(e.get("status"))) errors.add(tk + " entry point " + e.get("key") + ": unknown status " + e.get("status"));
            }
            String initial = Js.str(t.get("initialStatus"));
            if (initial != null && !statusKeys.contains(initial)) errors.add(tk + ": unknown initialStatus " + initial);
            if (initial == null && maps(t.get("entryPoints")).isEmpty()) errors.add(tk + ": needs an entry point or an initialStatus");

            for (Map<String, Object> x : maps(t.get("transitions"))) {
                String id = tk + "." + x.get("key");
                for (String f : strings(x.get("from"))) if (!f.equals("*") && !statusKeys.contains(f)) errors.add(id + ": unknown from-status " + f);
                String to = Js.str(x.get("to"));
                if (to != null && !statusKeys.contains(to)) errors.add(id + ": unknown target status " + to);
                String ent = Js.str(x.get("entitlement"));
                if (ent != null && !ents.contains(ent)) errors.add(id + ": entitlement " + ent + " is not in the catalog");
                List<String> actors = strings(x.get("actors"));
                if (actors.contains("STAFF") && !actors.contains("CUSTOMER") && ent == null) errors.add(id + ": a staff-only transition needs an entitlement");
                boolean hasTarget = false;
                for (Map<String, Object> g : maps(x.get("guards"))) {
                    String type = (String) g.get("type");
                    if (type.equals("TRACK_STATUS_IS")) {
                        Map<String, Object> other = null;
                        for (Map<String, Object> o : tracks) if (o.get("key").equals(g.get("track"))) other = o;
                        if (other == null) errors.add(id + ": guard references unknown track " + g.get("track"));
                        else {
                            Set<String> otherStatuses = new HashSet<>();
                            for (Map<String, Object> st : maps(other.get("statuses"))) otherStatuses.add((String) st.get("key"));
                            for (String st : strings(g.get("statuses"))) {
                                if (!otherStatuses.contains(st)) errors.add(id + ": guard references unknown status " + g.get("track") + "." + st);
                            }
                        }
                    }
                    if (type.equals("REFERRAL_LOCK") && !statusKeys.contains(g.get("status"))) errors.add(id + ": REFERRAL_LOCK status " + g.get("status") + " is unknown");
                    if (type.equals("REFERRAL_TARGET")) hasTarget = true;
                }
                if (!hasTarget && containsTargetTemplate(x.get("effects"))) errors.add(id + ": uses target.* without a REFERRAL_TARGET guard");
            }
        }

        for (Map<String, Object> q : queues) {
            Map<String, Object> t = null;
            for (Map<String, Object> x : tracks) if (x.get("key").equals(q.get("track"))) t = x;
            if (t == null) { errors.add("queue " + q.get("key") + ": unknown track " + q.get("track")); continue; }
            Set<String> statusKeys = new HashSet<>();
            for (Map<String, Object> st : maps(t.get("statuses"))) statusKeys.add((String) st.get("key"));
            for (String st : strings(q.get("statuses"))) if (!statusKeys.contains(st)) errors.add("queue " + q.get("key") + ": unknown status " + st);
            for (String f : List.of("requiresEntitlement", "requiresAlso", "excludesEntitlement")) {
                String e = Js.str(q.get(f));
                if (e != null && !ents.contains(e)) errors.add("queue " + q.get("key") + ": entitlement " + e + " is not in the catalog");
            }
        }

        // Every status must be reachable from an entry point or the track's initial status.
        for (Map<String, Object> t : tracks) {
            Set<String> reach = new LinkedHashSet<>();
            for (Map<String, Object> e : maps(t.get("entryPoints"))) reach.add((String) e.get("status"));
            if (t.get("initialStatus") != null) reach.add((String) t.get("initialStatus"));
            for (boolean changed = true; changed; ) {
                changed = false;
                for (Map<String, Object> x : maps(t.get("transitions"))) {
                    String to = Js.str(x.get("to"));
                    if (to == null || reach.contains(to)) continue;
                    List<String> from = strings(x.get("from"));
                    if (from.contains("*") || from.stream().anyMatch(reach::contains)) { reach.add(to); changed = true; }
                }
            }
            for (Map<String, Object> st : maps(t.get("statuses"))) {
                if (!reach.contains(st.get("key"))) errors.add(t.get("key") + "." + st.get("key") + ": status is unreachable");
            }
        }

        return new Result(errors.isEmpty(), errors);
    }

    private static boolean containsTargetTemplate(Object effects) {
        return containsText(effects, "{{target.");
    }
}
