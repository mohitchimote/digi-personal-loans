package com.digibank.workflow.service;

import com.digibank.workflow.client.Directory;
import com.digibank.workflow.client.Directory.OrgUnit;
import com.digibank.workflow.client.Directory.StaffMember;
import com.digibank.workflow.engine.Model.LadderRole;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory stand-ins for the other services (mandates, ladder, org tree, staff) and the audit sink. */
public class TestDirectory implements Directory.Mandates, Directory.Ladder, Directory.Org, Directory.Staff, AuditSink {

    public final Map<String, Double> limits = new ConcurrentHashMap<>();
    public final List<LadderRole> ladder = new ArrayList<>();
    public final List<OrgUnit> units = new ArrayList<>();
    public final List<StaffMember> staff = new ArrayList<>();
    public final List<String> audits = new ArrayList<>();
    public boolean orgDown = false;

    public TestDirectory() { reset(); }

    public void reset() {
        limits.clear(); ladder.clear(); units.clear(); staff.clear(); audits.clear(); orgDown = false;
        limits.put("UNDERWRITER", 100000.0);
        limits.put("SENIOR_UNDERWRITER", 300000.0);
        ladder.add(new LadderRole("UNDERWRITER", "Underwriter", 1));
        ladder.add(new LadderRole("SENIOR_UNDERWRITER", "Senior Underwriter", 2));
        ladder.add(new LadderRole("HEAD_OF_LENDING", "Head of Lending", 3));
        // 1 = head office, 2 = region under it, 3 = branch under the region, 4 = another branch
        units.add(new OrgUnit(1, null, 1L, "Head office", "HO", true));
        units.add(new OrgUnit(2, 1L, 2L, "Region", "R1", true));
        units.add(new OrgUnit(3, 2L, 3L, "Branch A", "BA", true));
        units.add(new OrgUnit(4, 2L, 3L, "Branch B", "BB", true));
    }

    public TestDirectory addStaff(long id, String name, String role, Long unit, boolean available) {
        staff.add(new StaffMember(id, "u" + id, name, role, unit, available, "ALL", null));
        return this;
    }

    @Override public Double limit(String role, Long orgUnitId, String applicationType) { return limits.get(role); }

    @Override public List<LadderRole> ladder() { return ladder; }

    @Override public List<OrgUnit> units() {
        if (orgDown) throw new Directory.UpstreamUnavailableException("org down", null);
        return units;
    }

    @Override public List<StaffMember> staff(Collection<String> roles, Collection<Long> orgUnitIds) {
        return staff.stream().filter(s -> roles == null || roles.isEmpty() || roles.contains(s.role())).toList();
    }

    @Override public void record(String eventType, String subjectType, String subjectId, String actor, String actorRole, String detail) {
        audits.add(eventType + "|" + subjectId + "|" + detail);
    }

    @TestConfiguration
    public static class Config {
        @Bean public TestDirectory testDirectory() { return new TestDirectory(); }
    }
}
