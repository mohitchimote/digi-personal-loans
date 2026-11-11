package com.digibank.rule.mandates;

import com.digibank.rule.directory.AuthDirectory;
import com.digibank.rule.directory.AuthDirectory.OrgUnitInfo;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/** The approval limit for a role on one case. Needs the org tree only when the case has an org unit. */
@Service
public class MandateResolveService {

    private final MandateRepository mandates;
    private final AuthDirectory directory;

    public MandateResolveService(MandateRepository mandates, AuthDirectory directory) {
        this.mandates = mandates;
        this.directory = directory;
    }

    /** @throws com.digibank.rule.directory.DirectoryUnavailableException when the case has a unit and the tree cannot be read */
    public MandateResolver.Resolved resolve(String roleCode, Long orgUnitId, String applicationType) {
        Map<Long, Long> parentOf = new HashMap<>();
        if (orgUnitId != null) {
            for (OrgUnitInfo u : directory.orgUnits()) parentOf.put(u.id(), u.parentId());
        }
        return MandateResolver.resolve(mandates.findByRoleCode(roleCode), MandateResolver.ancestorChain(parentOf, orgUnitId), applicationType);
    }
}
