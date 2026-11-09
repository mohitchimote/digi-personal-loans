package com.digibank.auth.access;

/**
 * How many cases sit in an org unit. Cases are owned by the application-service, not this one, so
 * until that link exists (milestone M2) the default answer is "none known". Deleting a unit is
 * refused when cases remain, which makes this the one place that rule is incomplete on the Java
 * side today.
 */
public interface OrgUnitUsage {
    long caseCount(long orgUnitId);
}
