package com.digibank.rule.mandates;

import com.digibank.rule.compliance.ComplianceAuditWriter;
import com.digibank.rule.directory.AuthDirectory;
import com.digibank.rule.directory.AuthDirectory.LadderRole;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;

/** Admin CRUD over mandates, with the Worker's rules and wording (routes/admin-mandates.ts). */
@Service
public class MandateAdminService {

    /** Who did it, as the audit trail records it. */
    public record Actor(String name, String role) {}

    public record Overview(List<Mandate> mandates, List<LadderRole> ladder) {}

    private final MandateRepository mandates;
    private final AuthDirectory directory;
    private final ComplianceAuditWriter audit;

    public MandateAdminService(MandateRepository mandates, AuthDirectory directory, ComplianceAuditWriter audit) {
        this.mandates = mandates;
        this.directory = directory;
        this.audit = audit;
    }

    public Overview overview() {
        return new Overview(mandates.findAllByOrderByRoleCodeAscIdAsc(), directory.ladder());
    }

    public Mandate create(MandateRequest req, Actor actor) {
        req.check();
        validate(req, null);
        Mandate saved = mandates.save(new Mandate(req.roleCode(), req.orgUnitId(), req.applicationType(), req.maxAmount()));
        audit.record("MANDATE_CREATED", "Mandate", String.valueOf(saved.getId()), actor.name(), actor.role(),
                req.roleCode() + " unit=" + or(req.orgUnitId()) + " type=" + or(req.applicationType()) + " max=" + num(req.maxAmount()));
        return saved;
    }

    public Mandate update(long id, MandateRequest req, Actor actor) {
        Mandate existing = mandates.findById(id).orElseThrow(() -> new MandateApiException("Mandate not found.", 404));
        req.check();
        validate(req, id);
        double before = existing.getMaxAmount();
        existing.setRoleCode(req.roleCode());
        existing.setOrgUnitId(req.orgUnitId());
        existing.setApplicationType(req.applicationType());
        existing.setMaxAmount(req.maxAmount());
        Mandate saved = mandates.save(existing);
        audit.record("MANDATE_UPDATED", "Mandate", String.valueOf(id), actor.name(), actor.role(),
                num(before) + " -> " + num(req.maxAmount()));
        return saved;
    }

    public void delete(long id, Actor actor) {
        Mandate existing = mandates.findById(id).orElseThrow(() -> new MandateApiException("Mandate not found.", 404));
        mandates.delete(existing);
        audit.record("MANDATE_DELETED", "Mandate", String.valueOf(id), actor.name(), actor.role(),
                existing.getRoleCode() + " max=" + num(existing.getMaxAmount()));
    }

    private void validate(MandateRequest req, Long selfId) {
        LadderRole role = directory.ladder().stream().filter(r -> r.code().equals(req.roleCode())).findFirst().orElse(null);
        if (role == null || role.rank() == null) {
            throw new MandateApiException("Mandates can only be set for roles on the escalation ladder (give the role a rank first).");
        }
        if (req.orgUnitId() != null && directory.orgUnits().stream().noneMatch(u -> u.id().equals(req.orgUnitId()))) {
            throw new MandateApiException("Unknown org unit.");
        }
        boolean duplicate = mandates.findByRoleCode(req.roleCode()).stream().anyMatch(m ->
                !Objects.equals(m.getId(), selfId) && Objects.equals(m.getOrgUnitId(), req.orgUnitId())
                        && Objects.equals(m.getApplicationType(), req.applicationType()));
        if (duplicate) throw new MandateApiException("A mandate for that role, unit and application type already exists - edit it instead.");
    }

    private static String or(Object o) {
        return o == null ? "any" : String.valueOf(o);
    }

    /** A number as JavaScript prints it in the Worker's audit detail: 100000, not 100000.0. */
    static String num(double d) {
        return BigDecimal.valueOf(d).stripTrailingZeros().toPlainString();
    }
}
