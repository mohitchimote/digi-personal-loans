package com.digibank.auth.access;

import org.springframework.stereotype.Component;

/** Placeholder until the application-service can be asked (see {@link OrgUnitUsage}). */
@Component
class UnknownCaseCounts implements OrgUnitUsage {
    @Override
    public long caseCount(long orgUnitId) {
        return 0;
    }
}
