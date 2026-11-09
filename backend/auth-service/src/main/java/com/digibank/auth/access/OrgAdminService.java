package com.digibank.auth.access;

import com.digibank.auth.compliance.ComplianceAuditWriter;
import com.digibank.auth.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The organisational hierarchy, administered as plain data (Y1): levels such as Head Office, Region and
 * Branch, and the units placed on them. Nothing here names a specific level. The rules are the Worker's
 * (routes/admin-org.ts), including their wording, so the Organisation page behaves the same on both.
 */
@Service
public class OrgAdminService {

    private final OrgLevelRepository levels;
    private final OrgUnitRepository units;
    private final UserRepository users;
    private final OrgUnitUsage usage;
    private final ComplianceAuditWriter audit;

    public OrgAdminService(OrgLevelRepository levels, OrgUnitRepository units, UserRepository users,
                           OrgUnitUsage usage, ComplianceAuditWriter audit) {
        this.levels = levels;
        this.units = units;
        this.users = users;
        this.usage = usage;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public OrgOverview overview() {
        List<OrgLevel> l = new ArrayList<>(levels.findAll());
        l.sort(Comparator.comparingInt(OrgLevel::getDepth));
        List<OrgUnit> u = new ArrayList<>(units.findAll());
        u.sort(Comparator.comparing(OrgUnit::getName));
        return new OrgOverview(l, u);
    }

    // ---- levels

    @Transactional
    public OrgLevel createLevel(LevelRequest req, AdminActor actor) {
        String name = req.name().trim();
        if (levels.existsByName(name)) throw new AdminApiException("A level with that name already exists.");
        OrgLevel level = new OrgLevel();
        level.setName(name);
        level.setDepth(req.depth());
        OrgLevel saved = levels.save(level);
        audit.record("ORG_LEVEL_CREATED", "OrgLevel", String.valueOf(saved.getId()), actor.uuid(), actor.role(), name);
        return saved;
    }

    @Transactional
    public OrgLevel updateLevel(long id, LevelRequest req, AdminActor actor) {
        OrgLevel existing = levels.findById(id).orElseThrow(() -> new AdminApiException("Level not found.", 404));
        String name = req.name().trim();
        boolean taken = levels.findAll().stream().anyMatch(o -> !o.getId().equals(id) && o.getName().equals(name));
        if (taken) throw new AdminApiException("A level with that name already exists.");
        String before = existing.getName();
        existing.setName(name);
        existing.setDepth(req.depth());
        OrgLevel saved = levels.save(existing);
        audit.record("ORG_LEVEL_UPDATED", "OrgLevel", String.valueOf(id), actor.uuid(), actor.role(), before + " -> " + name);
        return saved;
    }

    @Transactional
    public void deleteLevel(long id, AdminActor actor) {
        if (units.countByLevelId(id) > 0) throw new AdminApiException("Level is in use by org units - move or delete them first.");
        if (levels.existsById(id)) levels.deleteById(id);
        audit.record("ORG_LEVEL_DELETED", "OrgLevel", String.valueOf(id), actor.uuid(), actor.role(), null);
    }

    // ---- units

    /** A unit must sit on a deeper level than its parent, and re-parenting must not create a cycle. */
    private void validateUnit(UnitRequest req, Long selfId) {
        OrgLevel level = levels.findById(req.levelId()).orElseThrow(() -> new AdminApiException("Unknown level."));
        if (req.parentId() != null) {
            OrgUnit parent = units.findById(req.parentId()).orElseThrow(() -> new AdminApiException("Unknown parent unit."));
            OrgLevel parentLevel = levels.findById(parent.getLevelId()).orElse(null);
            if (parentLevel != null && parentLevel.getDepth() >= level.getDepth()) {
                throw new AdminApiException("A " + level.getName() + " must sit under a higher level than " + parentLevel.getName() + ".");
            }
            if (selfId != null && subtreeIds(selfId).contains(req.parentId())) {
                throw new AdminApiException("A unit cannot be moved under itself or one of its own descendants.");
            }
        }
    }

    @Transactional
    public OrgUnit createUnit(UnitRequest req, AdminActor actor) {
        String code = req.code().trim();
        if (units.existsByCode(code)) throw new AdminApiException("A unit with that code already exists.");
        validateUnit(req, null);
        OrgUnit unit = new OrgUnit();
        unit.setCode(code);
        unit.setName(req.name().trim());
        unit.setLevelId(req.levelId());
        unit.setParentId(req.parentId());
        unit.setActive(req.active() == null || req.active());
        OrgUnit saved = units.save(unit);
        audit.record("ORG_UNIT_CREATED", "OrgUnit", String.valueOf(saved.getId()), actor.uuid(), actor.role(), code + " " + saved.getName());
        return saved;
    }

    @Transactional
    public OrgUnit updateUnit(long id, UnitRequest req, AdminActor actor) {
        OrgUnit existing = units.findById(id).orElseThrow(() -> new AdminApiException("Unit not found.", 404));
        String code = req.code().trim();
        if (!code.equals(existing.getCode()) && units.existsByCode(code)) throw new AdminApiException("A unit with that code already exists.");
        validateUnit(req, id);
        String before = existing.getCode() + " " + existing.getName();
        existing.setCode(code);
        existing.setName(req.name().trim());
        existing.setLevelId(req.levelId());
        existing.setParentId(req.parentId());
        if (req.active() != null) existing.setActive(req.active());
        OrgUnit saved = units.save(existing);
        audit.record("ORG_UNIT_UPDATED", "OrgUnit", String.valueOf(id), actor.uuid(), actor.role(), before);
        return saved;
    }

    /** Only an empty unit can be deleted; otherwise deactivate it. Keeps case history attributable. */
    @Transactional
    public void deleteUnit(long id, AdminActor actor) {
        long kids = units.findByParentId(id).size();
        long staff = users.countByOrgUnitId(id);
        long cases = usage.caseCount(id);
        if (kids > 0 || staff > 0 || cases > 0) {
            throw new AdminApiException("Unit still has " + kids + " child unit(s), " + staff + " staff user(s) and " + cases
                    + " case(s) - deactivate it instead of deleting.");
        }
        if (units.existsById(id)) units.deleteById(id);
        audit.record("ORG_UNIT_DELETED", "OrgUnit", String.valueOf(id), actor.uuid(), actor.role(), null);
    }

    /** The unit itself plus every descendant, walking parent links (with a guard against cycles). */
    @Transactional(readOnly = true)
    public List<Long> subtreeIds(long rootId) {
        Map<Long, List<Long>> childrenOf = new HashMap<>();
        for (OrgUnit u : units.findAll()) {
            if (u.getParentId() != null) childrenOf.computeIfAbsent(u.getParentId(), k -> new ArrayList<>()).add(u.getId());
        }
        List<Long> out = new ArrayList<>();
        List<Long> stack = new ArrayList<>(List.of(rootId));
        while (!stack.isEmpty()) {
            Long id = stack.remove(stack.size() - 1);
            if (out.contains(id)) continue;
            out.add(id);
            stack.addAll(childrenOf.getOrDefault(id, List.of()));
        }
        return out;
    }
}
