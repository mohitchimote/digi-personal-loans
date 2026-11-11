package com.digibank.auth.internal;

import com.digibank.auth.access.AdminApiException;
import com.digibank.auth.access.OrgUnit;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * What the other services ask auth-service, since it owns people, roles and the org hierarchy. Reached by service
 * calls presenting X-Internal-Key (or by a staff token), never by customers: see SecurityConfig. Bare JSON, not
 * wrapped in {success, message, data}, because these are read by services, not screens.
 */
@RestController
@RequestMapping("/api/auth/internal")
public class InternalDirectoryController {

    private final InternalDirectoryService directory;

    public InternalDirectoryController(InternalDirectoryService directory) {
        this.directory = directory;
    }

    /** The whole hierarchy, flat: [{id, parentId, levelId, name, code, active}]. Callers build the tree. */
    @GetMapping("/org/units")
    public List<InternalDirectoryService.OrgUnitView> orgUnits() {
        return directory.orgUnits();
    }

    /** Roles on the escalation ladder, most junior first: [{code, label, rank}]. */
    @GetMapping("/roles/ladder")
    public List<InternalDirectoryService.LadderRoleView> ladder() {
        return directory.ladder();
    }

    /** Every staff role's configuration, so a caller can pick, for example, the roles holding an entitlement. */
    @GetMapping("/roles")
    public List<InternalDirectoryService.RoleConfigView> roles() {
        return directory.roles();
    }

    /** One role's configuration. An unknown code (a customer, or a deleted role) answers isStaff=false with nothing held. */
    @GetMapping("/roles/{code}")
    public InternalDirectoryService.RoleConfigView role(@PathVariable String code) {
        return directory.role(code);
    }

    /** Enabled staff who could own a case, flagged by availability. role: one or more role codes (default: every
     * staff role); orgUnitIds: only people placed in one of these units (default: no unit filter). */
    @GetMapping("/staff")
    public List<InternalDirectoryService.StaffView> staff(@RequestParam(required = false) List<String> role,
                                                           @RequestParam(required = false) List<Long> orgUnitIds) {
        return directory.staff(role, orgUnitIds);
    }

    @GetMapping("/staff/{userId}/availability")
    public Map<String, Boolean> availability(@PathVariable long userId) {
        return Map.of("available", directory.isAvailable(userId));
    }

    /** Body {"available": true|false}; answers {"available": ...}. The workflow service calls this for the signed-in person. */
    @PutMapping("/staff/{userId}/availability")
    public Map<String, Boolean> setAvailability(@PathVariable long userId, @RequestBody Map<String, Object> body) {
        if (!(body.get("available") instanceof Boolean available)) {
            throw new AdminApiException("available must be true or false.");
        }
        return Map.of("available", directory.setAvailable(userId, available));
    }
}
