package com.digibank.auth.access;

/**
 * How many cases sit in an org unit. Cases are owned by application-service, so it is asked. Deleting a unit is
 * refused when cases remain, so an implementation that cannot get an answer must throw (the delete is then
 * refused), never answer 0 on a guess.
 */
public interface OrgUnitUsage {
    long caseCount(long orgUnitId);
}
