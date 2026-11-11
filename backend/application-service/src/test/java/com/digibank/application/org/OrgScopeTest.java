package com.digibank.application.org;

import com.digibank.application.client.AuthServiceOrgClient;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.security.AuthenticatedUser;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OrgScopeTest {

    static OrgUnitInfo unit(long id, Long parent) {
        return new OrgUnitInfo(id, parent, 1L, "U" + id, "U" + id, true);
    }

    // 1 -> 10 -> 11, 1 -> 20
    static final List<OrgUnitInfo> TREE = List.of(unit(1, null), unit(10, 1L), unit(11, 10L), unit(20, 1L));

    private OrgScope scopeWith(List<OrgUnitInfo> units) {
        AuthServiceOrgClient client = mock(AuthServiceOrgClient.class);
        when(client.units()).thenReturn(units);
        return new OrgScope(client);
    }

    private static AuthenticatedUser staff(String scope, Long unit) {
        return new AuthenticatedUser("u", 1L, "UNDERWRITER", "Name", Set.of(), scope, unit, null, "Underwriter", null);
    }

    private static LoanApplication caseIn(Long unit) {
        return LoanApplication.builder().applicationRef("A").customerId(1L).customerEmail("e").orgUnitId(unit).build();
    }

    @Test
    void subtreeIsTheUnitAndEveryDescendant() {
        assertThat(OrgScope.subtree(TREE, 1L)).containsExactlyInAnyOrder(1L, 10L, 11L, 20L);
        assertThat(OrgScope.subtree(TREE, 10L)).containsExactlyInAnyOrder(10L, 11L);
        assertThat(OrgScope.subtree(TREE, 11L)).containsExactly(11L);
    }

    @Test
    void aCycleInTheDirectoryDoesNotLoopForever() {
        List<OrgUnitInfo> cyclic = List.of(unit(1, 2L), unit(2, 1L));
        assertThat(OrgScope.subtree(cyclic, 1L)).containsExactlyInAnyOrder(1L, 2L);
    }

    @Test
    void scopeAllAndPeopleWithNoUnitAreUnrestricted() {
        OrgScope scope = scopeWith(TREE);
        assertThat(scope.visibleUnitIds(staff("ALL", 10L))).isNull();
        assertThat(scope.visibleUnitIds(staff("UNIT_ONLY", null))).isNull();
        assertThat(scope.visibleUnitIds(staff("UNIT_TREE", null))).isNull();
    }

    @Test
    void unitOnlyAndUnitTreeLimitTheVisibleUnits() {
        OrgScope scope = scopeWith(TREE);
        assertThat(scope.visibleUnitIds(staff("UNIT_ONLY", 10L))).containsExactly(10L);
        assertThat(scope.visibleUnitIds(staff("UNIT_TREE", 10L))).containsExactlyInAnyOrder(10L, 11L);
    }

    @Test
    void aCaseWithNoUnitIsVisibleToEveryone() {
        OrgScope scope = scopeWith(TREE);
        assertThat(scope.isVisible(staff("UNIT_ONLY", 20L), null)).isTrue();
        assertThat(scope.isVisible(staff("UNIT_ONLY", 20L), 10L)).isFalse();
        assertThat(scope.isVisible(staff("UNIT_TREE", 1L), 11L)).isTrue();
    }

    @Test
    void whenTheDirectoryIsUnreachableAUnitTreeCallerStillSeesTheirOwnUnit() {
        OrgScope scope = scopeWith(List.of());
        assertThat(scope.visibleUnitIds(staff("UNIT_TREE", 10L))).containsExactly(10L);
        assertThat(scope.isVisible(staff("UNIT_TREE", 10L), 11L)).isFalse();
    }

    @Test
    void filterKeepsUnassignedAndVisibleCasesInOrder() {
        OrgScope scope = scopeWith(TREE);
        List<LoanApplication> all = List.of(caseIn(10L), caseIn(20L), caseIn(null), caseIn(11L));
        assertThat(scope.filter(staff("UNIT_TREE", 10L), all)).containsExactly(all.get(0), all.get(2), all.get(3));
        assertThat(scope.filter(staff("ALL", 10L), all)).isSameAs(all);
    }
}
