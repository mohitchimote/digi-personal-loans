package com.digibank.workflow.engine;

import com.digibank.workflow.engine.Model.Actor;
import com.digibank.workflow.engine.Model.CaseState;
import com.digibank.workflow.engine.Model.Facts;
import com.digibank.workflow.engine.Model.LadderRole;
import com.digibank.workflow.engine.Model.Request;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * The workflow engine: pure functions, no I/O, no Spring. A host resolves facts first, calls these,
 * persists the result and runs the host effects. Contract and evaluation order are fixed in
 * workflow-spec/README.md and checked by workflow-spec/vectors. This is a port of the Worker's engine.ts.
 *
 * A definition and every result are generic JSON trees (see {@link Js}); results are returned as maps
 * with exactly the keys the spec names, so a host can hand them straight back as JSON.
 */
public final class Engine {
    private Engine() {}

    private static final Set<String> INPUT_DEPENDENT = Set.of("AMOUNT_POSITIVE", "MANDATE", "REASON_REQUIRED", "REFERRAL_TARGET");

    public static Map<String, Object> fail(int status, String code, String message) {
        return Js.obj("ok", false, "status", status, "code", code, "message", message);
    }

    public static boolean ok(Map<String, Object> result) {
        return Boolean.TRUE.equals(result.get("ok"));
    }

    /** The event an action emits: the explicit one, else "<track>.<action key>". */
    public static String eventOf(String trackKey, Map<String, Object> transition) {
        String e = Js.str(transition.get("event"));
        return e != null ? e : trackKey + "." + transition.get("key");
    }

    private static Map<String, Object> track(Map<String, Object> def, String key) {
        for (Object t : Js.listOrEmpty(def.get("tracks"))) if (key.equals(Js.map(t).get("key"))) return Js.map(t);
        return null;
    }

    private static String stageOf(Map<String, Object> track, String status) {
        for (Object s : Js.listOrEmpty(track.get("statuses"))) {
            Map<String, Object> st = Js.map(s);
            if (status.equals(st.get("key"))) return Js.str(st.get("stage"));
        }
        return null;
    }

    private static Map<String, Object> state(String status, String stage) {
        return Js.obj("status", status, "stage", stage);
    }

    public static Map<String, Object> createCase(Map<String, Object> def, String entryKey) {
        Map<String, Object> entryTrack = null;
        String entryStatus = null;
        outer:
        for (Object t : Js.listOrEmpty(def.get("tracks"))) {
            for (Object e : Js.listOrEmpty(Js.map(t).get("entryPoints"))) {
                if (entryKey.equals(Js.map(e).get("key"))) {
                    entryTrack = Js.map(t);
                    entryStatus = (String) Js.map(e).get("status");
                    break outer;
                }
            }
        }
        if (entryTrack == null) return fail(404, "UNKNOWN_ENTRY", "Unknown entry point: " + entryKey);
        Map<String, Object> tracks = new LinkedHashMap<>();
        for (Object o : Js.listOrEmpty(def.get("tracks"))) {
            Map<String, Object> t = Js.map(o);
            String status;
            if (t == entryTrack) status = entryStatus;
            else {
                status = Js.str(t.get("initialStatus"));
                if (status == null) {
                    List<Object> eps = Js.listOrEmpty(t.get("entryPoints"));
                    if (!eps.isEmpty()) status = Js.str(Js.map(eps.get(0)).get("status"));
                }
            }
            if (status == null) return fail(500, "INVALID_DEFINITION", "Track " + t.get("key") + " has no initial status");
            tracks.put((String) t.get("key"), state(status, stageOf(t, status)));
        }
        return Js.obj("ok", true, "tracks", tracks);
    }

    /** A located transition. */
    public record Found(Map<String, Object> track, Map<String, Object> transition) {
        public String trackKey() { return (String) track.get("key"); }
    }

    public static Found findTransition(Map<String, Object> def, String action) {
        for (Object t : Js.listOrEmpty(def.get("tracks"))) {
            for (Object x : Js.listOrEmpty(Js.map(t).get("transitions"))) {
                if (action.equals(Js.map(x).get("key"))) return new Found(Js.map(t), Js.map(x));
            }
        }
        return null;
    }

    /** Mutable per-evaluation context shared by guards (REFERRAL_TARGET sets target). */
    private static final class Env {
        final String trackKey;
        final CaseState c;
        final Actor actor;
        final Facts facts;
        final Map<String, Object> input;
        Map<String, Object> target;

        Env(String trackKey, CaseState c, Actor actor, Facts facts, Map<String, Object> input) {
            this.trackKey = trackKey; this.c = c; this.actor = actor; this.facts = facts; this.input = input;
        }
    }

    private static Map<String, Object> runGuard(Map<String, Object> g, Env env) {
        Actor actor = env.actor;
        Facts facts = env.facts;
        switch ((String) g.get("type")) {
            case "CASE_VISIBLE":
                return facts.caseVisible() ? null : fail(404, "CASE_NOT_FOUND", "Application not found.");

            case "OWNER_OR_ASSISTING": {
                boolean ok = "SYSTEM".equals(actor.type())
                        || ("CUSTOMER".equals(actor.type()) && facts.isOwner())
                        || ("STAFF".equals(actor.type()) && actor.has("case.actAsCustomer"));
                return ok ? null : fail(403, "NOT_OWNER", "You can only act on your own applications.");
            }

            case "REFERRAL_LOCK": {
                Map<String, Object> cur = env.c.tracks().get(env.trackKey);
                String current = cur == null ? null : (String) cur.get("status");
                Object to = env.c.fields().get("referredToRole");
                if (!g.get("status").equals(current) || !Js.truthy(to) || actor.rank() == null) return null;
                LadderRole target = null;
                for (LadderRole r : facts.ladder()) if (r.code().equals(to)) { target = r; break; }
                if (target != null && actor.rank() < target.rank()) {
                    return fail(403, "REFERRAL_LOCKED", "This case has been referred to " + target.label()
                            + " and can only be actioned at that level or above.");
                }
                return null;
            }

            case "AMOUNT_POSITIVE": {
                Object v = env.input.get((String) g.get("field"));
                boolean good = v instanceof Number n && Double.isFinite(n.doubleValue()) && n.doubleValue() > 0;
                return good ? null : fail(400, "INVALID_AMOUNT", "Amount must be greater than zero.");
            }

            case "MANDATE": {
                if ("SYSTEM".equals(actor.type())) return null;
                double amount = Js.toNumber(env.input.get((String) g.get("amountField")));
                double limit = facts.mandateLimit() == null ? 0 : facts.mandateLimit();
                return amount > limit
                        ? fail(403, "OVER_MANDATE", "Amount (" + Js.num(amount) + ") exceeds your mandate limit (" + Js.num(limit)
                        + ") for this case. Refer it to a higher approval level - there is no override.")
                        : null;
            }

            case "REASON_REQUIRED": {
                Object r = env.input.get("reason");
                return r instanceof String s && !s.trim().isEmpty() ? null : fail(400, "REASON_REQUIRED", "A reason is required.");
            }

            case "TRACK_STATUS_IS": {
                String trackKey = (String) g.get("track");
                Map<String, Object> t = env.c.tracks().get(trackKey);
                String s = t == null ? null : (String) t.get("status");
                boolean in = s != null && Js.listOrEmpty(g.get("statuses")).contains(s);
                return in ? null : fail(409, "INVALID_STATE", "Not allowed while " + trackKey + " is " + (s == null ? "unknown" : s) + ".");
            }

            case "REFERRAL_TARGET": {
                List<LadderRole> ladder = new ArrayList<>(facts.ladder());
                ladder.sort(Comparator.comparingInt(LadderRole::rank));
                int myRank = actor.rank() == null ? -1 : actor.rank();
                Object askedRaw = env.input.get("toRole");
                String asked = askedRaw instanceof String s && !s.isEmpty() ? s : null;
                if (asked != null) {
                    LadderRole t = null;
                    for (LadderRole r : ladder) if (r.code().equals(asked)) { t = r; break; }
                    if (t == null || myRank >= t.rank()) {
                        return fail(400, "INVALID_TARGET", "A case can only be referred to a role above your own.");
                    }
                    env.target = Js.obj("code", t.code(), "label", t.label(), "rank", t.rank());
                    return null;
                }
                LadderRole next = null;
                for (LadderRole r : ladder) if (r.rank() > myRank) { next = r; break; }
                if (next == null) return fail(400, "NO_HIGHER_LEVEL", "There is no higher approval level to refer this case to.");
                env.target = Js.obj("code", next.code(), "label", next.label(), "rank", next.rank());
                return null;
            }

            default:
                return fail(500, "INVALID_DEFINITION", "Unknown guard type: " + g.get("type"));
        }
    }

    private static boolean applicable(Map<String, Object> t, Actor actor, String currentStatus) {
        List<Object> actors = Js.listOrEmpty(t.get("actors"));
        if (!actors.contains(actor.type())) return false;
        String ent = Js.str(t.get("entitlement"));
        if ("STAFF".equals(actor.type()) && ent != null && !actor.has(ent)) return false;
        List<Object> from = Js.listOrEmpty(t.get("from"));
        return from.contains("*") || (currentStatus != null && from.contains(currentStatus));
    }

    public static Map<String, Object> evaluate(Map<String, Object> def, CaseState c, Request request, Facts facts) {
        Actor actor = request.actor();
        Map<String, Object> input = request.input() == null ? Map.of() : request.input();

        Found found = findTransition(def, request.action());
        if (found == null) return fail(404, "UNKNOWN_ACTION", "Unknown action: " + request.action());
        Map<String, Object> t = found.transition();
        String trackKey = found.trackKey();
        String key = (String) t.get("key");

        if (!Js.listOrEmpty(t.get("actors")).contains(actor.type())) {
            return fail(403, "ACTOR_NOT_ALLOWED", actor.type() + " cannot perform " + key + ".");
        }
        String ent = Js.str(t.get("entitlement"));
        if ("STAFF".equals(actor.type()) && ent != null && !actor.has(ent)) {
            return fail(403, "MISSING_ENTITLEMENT", "Forbidden.");
        }

        Map<String, Object> current = c.tracks().get(trackKey);
        if (current == null) return fail(500, "INVALID_CASE", "Case has no " + trackKey + " track.");
        List<Object> from = Js.listOrEmpty(t.get("from"));
        if (!from.contains("*") && !from.contains(current.get("status"))) {
            return fail(409, "INVALID_STATE", key + " is not allowed while the case is " + current.get("status") + ".");
        }

        Env env = new Env(trackKey, c, actor, facts, input);
        for (Object g : Js.listOrEmpty(t.get("guards"))) {
            Map<String, Object> failure = runGuard(Js.map(g), env);
            if (failure != null) return failure;
        }

        // ---- effects
        Map<String, Object> ctx = new LinkedHashMap<>();
        ctx.put("now", request.now());
        ctx.put("input", input);
        ctx.put("case", c.fields());
        ctx.put("actor", Js.obj("name", actor.name(), "userId", actor.userId(), "role", actor.role()));
        if (env.target != null) ctx.put("target", env.target);

        Map<String, Object> fieldUpdates = new LinkedHashMap<>();
        boolean referralClose = false;
        Map<String, Object> referralOpen = null;
        List<Object> hostEffects = new ArrayList<>();

        for (Object o : Js.listOrEmpty(t.get("effects"))) {
            Map<String, Object> e = Js.map(o);
            Map<String, Object> when = Js.map(e.get("when"));
            if (when != null && !Template.eval(when, ctx)) continue;
            switch ((String) e.get("type")) {
                case "SET" -> fieldUpdates.put((String) e.get("field"), Template.resolve(e.get("value"), ctx));
                case "REFERRAL_CLOSE" -> referralClose = true;
                case "REFERRAL_OPEN" -> referralOpen = Js.obj("toRole", Js.text(Template.resolve(e.get("toRole"), ctx)));
                case "NOTE" -> hostEffects.add(Js.obj("type", "NOTE",
                        "noteType", Template.resolve(e.get("noteType"), ctx),
                        "section", Template.resolve(e.get("section"), ctx),
                        "text", Template.resolve(e.get("text"), ctx)));
                case "NOTIFY" -> {
                    Map<String, Object> vars = Template.resolveVars(Js.map(e.get("vars")), ctx);
                    Map<String, Object> out = Js.obj("type", "NOTIFY", "template", e.get("template"));
                    if (vars != null) out.put("vars", vars);
                    hostEffects.add(out);
                }
                case "EMAIL" -> {
                    Map<String, Object> vars = Template.resolveVars(Js.map(e.get("vars")), ctx);
                    Map<String, Object> out = Js.obj("type", "EMAIL", "event", e.get("event"));
                    if (vars != null) out.put("vars", vars);
                    hostEffects.add(out);
                }
                case "GENERATE_DOC" -> hostEffects.add(Js.obj("type", "GENERATE_DOC", "doc", e.get("doc")));
                case "CARD_PAYMENT" -> hostEffects.add(Js.obj("type", "CARD_PAYMENT", "mode", e.get("mode")));
                case "PIN_FORM_VERSION", "UNPIN_FORM_VERSION", "RUN_AUTO_APPROVAL" -> hostEffects.add(Js.obj("type", e.get("type")));
                default -> { }
            }
        }

        String curStatus = (String) current.get("status");
        String toStatusKey = Js.str(t.get("to"));
        Map<String, Object> to = toStatusKey != null
                ? state(toStatusKey, stageOf(found.track(), toStatusKey))
                : state(curStatus, Js.str(current.get("stage")));
        Map<String, Object> tracks = new LinkedHashMap<>();
        for (Map.Entry<String, Map<String, Object>> en : c.tracks().entrySet()) tracks.put(en.getKey(), new LinkedHashMap<>(en.getValue()));
        tracks.put(trackKey, to);

        String event = eventOf(trackKey, t);
        Object reasonRaw = input.get("reason");
        Map<String, Object> log = Js.obj(
                "action", key, "event", event, "track", trackKey,
                "fromStatus", curStatus, "toStatus", toStatusKey != null ? toStatusKey : curStatus,
                "fromStage", current.get("stage"), "toStage", to.get("stage"),
                "actorType", actor.type(), "actorUserId", actor.userId(), "actorName", actor.name(), "actorRole", actor.role(),
                "reason", reasonRaw instanceof String ? reasonRaw : null, "at", request.now());

        return Js.obj("ok", true, "action", key, "event", event, "track", trackKey,
                "from", state(curStatus, Js.str(current.get("stage"))), "to", to, "tracks", tracks,
                "fieldUpdates", fieldUpdates,
                "referral", Js.obj("close", referralClose, "open", referralOpen),
                "hostEffects", hostEffects, "log", log);
    }

    /** Which actions the actor can take on this case right now, for the UI. */
    public static Map<String, Object> allowedActions(Map<String, Object> def, CaseState c, Actor actor, Facts facts) {
        List<String> allowed = new ArrayList<>();
        Map<String, Object> blocked = new TreeMap<>();
        for (Object to : Js.listOrEmpty(def.get("tracks"))) {
            Map<String, Object> track = Js.map(to);
            String trackKey = (String) track.get("key");
            Map<String, Object> cur = c.tracks().get(trackKey);
            String curStatus = cur == null ? null : (String) cur.get("status");
            for (Object xo : Js.listOrEmpty(track.get("transitions"))) {
                Map<String, Object> t = Js.map(xo);
                if (!applicable(t, actor, curStatus)) continue;
                Env env = new Env(trackKey, c, actor, facts, Map.of());
                Map<String, Object> failure = null;
                for (Object go : Js.listOrEmpty(t.get("guards"))) {
                    Map<String, Object> g = Js.map(go);
                    if (INPUT_DEPENDENT.contains(g.get("type"))) continue;
                    failure = runGuard(g, env);
                    if (failure != null) break;
                }
                if (failure == null) allowed.add((String) t.get("key"));
                else if (!"NOT_OWNER".equals(failure.get("code")) && !"CASE_NOT_FOUND".equals(failure.get("code"))) {
                    blocked.put((String) t.get("key"), failure.get("code"));
                }
            }
        }
        allowed.sort(Comparator.naturalOrder());
        return Js.obj("allowed", allowed, "blocked", new LinkedHashMap<>(blocked));
    }

    public static Map<String, Object> queueAccess(Map<String, Object> def, Actor actor, String queue) {
        Map<String, Object> q = null;
        for (Object o : Js.listOrEmpty(def.get("queues"))) if (queue.equals(Js.map(o).get("key"))) { q = Js.map(o); break; }
        if (q == null) return fail(404, "UNKNOWN_QUEUE", "Unknown queue: " + queue);
        String requires = (String) q.get("requiresEntitlement");
        String also = Js.str(q.get("requiresAlso"));
        String excludes = Js.str(q.get("excludesEntitlement"));
        if (!actor.has(requires) || (also != null && !actor.has(also)) || (excludes != null && actor.has(excludes))) {
            return fail(403, "MISSING_ENTITLEMENT", "Forbidden.");
        }
        return Js.obj("ok", true, "queue", q.get("key"), "statuses", new ArrayList<>(Js.listOrEmpty(q.get("statuses"))),
                "applyScope", q.get("applyScope"), "hideReferredAbove", q.get("hideReferredAbove"));
    }
}
