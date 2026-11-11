package com.digibank.workflow.engine;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * How an action is presented to people: which inputs it asks for and where its button goes. Pure
 * functions over a transition (port of the Worker's presentation.ts), shared by the host and tested
 * without a database.
 */
public final class Presentation {
    private Presentation() {}

    /** One thing the caller must (or may) supply when running an action. kind: text, number, role or boolean. */
    public record ActionInput(String field, String kind, boolean required) {
        public Map<String, Object> toJson() { return Js.obj("field", field, "kind", kind, "required", required); }
    }

    /** Presentation with defaults filled in. icon and after may be null. */
    public record ResolvedUi(String area, String style, String icon, String after) {
        public Map<String, Object> toJson() { return Js.obj("area", area, "style", style, "icon", icon, "after", after); }
    }

    private static final Map<String, String> KNOWN_KINDS = Map.of(
            "reason", "text", "approvedAmount", "number", "toRole", "role", "requireGuarantor", "boolean");
    private static final Set<String> NOT_ASKED = Set.of("section", "noteType");
    private static final Pattern INPUT_REF = Pattern.compile("input\\.([A-Za-z_][A-Za-z0-9_]*)");

    /** Disbursement-track actions go to the disbursement area; a staff-only action that asks for a decision
     * input (a reason, an amount, a role) is a decision; everything else is general. */
    private static String defaultArea(String trackKey, Map<String, Object> t) {
        if (trackKey.equals("disbursement")) return "disbursement";
        List<Object> actors = Js.listOrEmpty(t.get("actors"));
        boolean staffOnly = actors.size() == 1 && "STAFF".equals(actors.get(0));
        boolean asksForDecision = inputsOf(t).stream().anyMatch(i -> i.required() || i.field().equals("toRole") || i.kind().equals("number"));
        return staffOnly && asksForDecision ? "decision" : "general";
    }

    public static ResolvedUi resolveUi(String trackKey, Map<String, Object> t) {
        Map<String, Object> ui = Js.map(t.get("ui"));
        String area = ui == null ? null : Js.str(ui.get("area"));
        String style = ui == null ? null : Js.str(ui.get("style"));
        String icon = ui == null ? null : Js.str(ui.get("icon"));
        String after = ui == null ? null : Js.str(ui.get("after"));
        return new ResolvedUi(area != null ? area : defaultArea(trackKey, t), style != null ? style : "secondary", icon, after);
    }

    /** The inputs an action asks for: guards say which are required; every other input.field the effects
     * and conditions refer to is offered as an optional input (an action added in the builder gets its fields
     * without a code change). */
    public static List<ActionInput> inputsOf(Map<String, Object> t) {
        Map<String, ActionInput> out = new LinkedHashMap<>();
        for (Object go : Js.listOrEmpty(t.get("guards"))) {
            Map<String, Object> g = Js.map(go);
            switch ((String) g.get("type")) {
                case "REASON_REQUIRED" -> out.put("reason", new ActionInput("reason", "text", true));
                case "AMOUNT_POSITIVE" -> out.put((String) g.get("field"), new ActionInput((String) g.get("field"), "number", true));
                case "MANDATE" -> {
                    String f = (String) g.get("amountField");
                    if (!out.containsKey(f)) out.put(f, new ActionInput(f, "number", false));
                }
                case "REFERRAL_TARGET" -> out.put("toRole", new ActionInput("toRole", "role", false));
                default -> { }
            }
        }
        Matcher m = INPUT_REF.matcher(Js.stringify(List.of(t.get("effects") == null ? List.of() : t.get("effects"),
                t.get("guards") == null ? List.of() : t.get("guards"))));
        while (m.find()) {
            String field = m.group(1);
            if (NOT_ASKED.contains(field) || out.containsKey(field)) continue;
            out.put(field, new ActionInput(field, KNOWN_KINDS.getOrDefault(field, "text"), false));
        }
        return List.copyOf(out.values());
    }
}
