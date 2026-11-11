package com.digibank.rule.mandates;

import com.digibank.rule.directory.AuthDirectory;
import com.digibank.rule.directory.DirectoryUnavailableException;

import java.util.ArrayList;
import java.util.List;

/** An in-memory stand-in for auth-service: a small org tree and the five default ladder roles. */
class FakeDirectory implements AuthDirectory {

    boolean down;
    final List<OrgUnitInfo> units = new ArrayList<>(List.of(
            new OrgUnitInfo(1L, null), new OrgUnitInfo(2L, 1L), new OrgUnitInfo(3L, 2L)));
    final List<LadderRole> ladder = new ArrayList<>(List.of(
            new LadderRole("UNDERWRITER", "Underwriter", 1), new LadderRole("SENIOR_UNDERWRITER", "Senior Underwriter", 2),
            new LadderRole("HEAD_OF_LENDING", "Head of Lending", 3), new LadderRole("COO", "COO", 4), new LadderRole("CEO", "CEO", 5)));

    @Override
    public List<OrgUnitInfo> orgUnits() {
        if (down) throw new DirectoryUnavailableException("down", null);
        return units;
    }

    @Override
    public List<LadderRole> ladder() {
        if (down) throw new DirectoryUnavailableException("down", null);
        return ladder;
    }
}
