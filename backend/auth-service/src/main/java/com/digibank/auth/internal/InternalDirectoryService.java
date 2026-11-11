package com.digibank.auth.internal;

import com.digibank.auth.access.*;
import com.digibank.auth.compliance.ComplianceAuditWriter;
import com.digibank.auth.identity.TokenClaims;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Set;

/** The reads and the one write behind {@link InternalDirectoryController}. */
@Service
public class InternalDirectoryService {

    public record OrgUnitView(Long id, Long parentId, Long levelId, String name, String code, boolean active) {}

    public record LadderRoleView(String code, String label, int rank) {}

    public record RoleConfigView(String code, String label, boolean isStaff, String scope, Integer rank, List<String> entitlements) {}

    /** userId and uuid identify the person; role and orgUnitId place them; available is the routing flag. */
    public record StaffView(Long userId, String uuid, String fullName, String email, String role, Long orgUnitId, boolean available) {}

    private final OrgUnitRepository units;
    private final RoleConfigService roles;
    private final UserRepository users;
    private final ComplianceAuditWriter audit;

    public InternalDirectoryService(OrgUnitRepository units, RoleConfigService roles, UserRepository users, ComplianceAuditWriter audit) {
        this.units = units;
        this.roles = roles;
        this.users = users;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<OrgUnitView> orgUnits() {
        return units.findAll().stream().sorted(Comparator.comparing(OrgUnit::getId))
                .map(u -> new OrgUnitView(u.getId(), u.getParentId(), u.getLevelId(), u.getName(), u.getCode(), u.isActive())).toList();
    }

    public List<LadderRoleView> ladder() {
        return roles.allStaffRoles().stream().filter(r -> r.rank() != null)
                .sorted(Comparator.comparingInt(RoleConfig::rank))
                .map(r -> new LadderRoleView(r.code(), r.label(), r.rank())).toList();
    }

    public List<RoleConfigView> roles() {
        return roles.allStaffRoles().stream().sorted(Comparator.comparing(RoleConfig::code)).map(InternalDirectoryService::view).toList();
    }

    public RoleConfigView role(String code) {
        return view(roles.resolve(code));
    }

    private static RoleConfigView view(RoleConfig r) {
        return new RoleConfigView(r.code(), r.label(), r.isStaff(), r.scope().name(), r.rank(),
                r.isStaff() ? TokenClaims.inCatalogOrder(r) : List.of());
    }

    @Transactional(readOnly = true)
    public List<StaffView> staff(List<String> roleCodes, List<Long> orgUnitIds) {
        Set<String> staffCodes = roles.allStaffRoles().stream().map(RoleConfig::code).collect(java.util.stream.Collectors.toSet());
        List<String> wanted = (roleCodes == null || roleCodes.isEmpty() ? List.copyOf(staffCodes) : roleCodes).stream()
                .filter(staffCodes::contains).toList();
        if (wanted.isEmpty()) return List.of();
        return users.findByRoleInAndEnabledTrue(wanted).stream()
                // With a unit filter, someone not placed in any unit never matches (as the Worker's unit rules treat them).
                .filter(u -> orgUnitIds == null || orgUnitIds.isEmpty() || (u.getOrgUnitId() != null && orgUnitIds.contains(u.getOrgUnitId())))
                .sorted(Comparator.comparing(User::getId))
                .map(u -> new StaffView(u.getId(), u.getUuid(), u.getFullName(), u.getEmail(), u.getRole(), u.getOrgUnitId(), u.isAvailable()))
                .toList();
    }

    @Transactional(readOnly = true)
    public boolean isAvailable(long userId) {
        return staffMember(userId).isAvailable();
    }

    @Transactional
    public boolean setAvailable(long userId, boolean available) {
        User user = staffMember(userId);
        user.setAvailable(available);
        users.save(user);
        audit.record(available ? "STAFF_AVAILABLE" : "STAFF_UNAVAILABLE", "User", String.valueOf(userId),
                user.getFullName() != null && !user.getFullName().isBlank() ? user.getFullName().trim() : user.getEmail(), user.getRole(), null);
        return available;
    }

    private User staffMember(long userId) {
        User user = users.findById(userId).orElseThrow(() -> new AdminApiException("User not found: " + userId, 404));
        if (!roles.resolve(user.getRole()).isStaff()) throw new AdminApiException("Forbidden.", 403);
        return user;
    }
}
