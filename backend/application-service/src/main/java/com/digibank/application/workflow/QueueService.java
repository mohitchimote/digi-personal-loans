package com.digibank.application.workflow;

import com.digibank.application.client.RoleLadderClient;
import com.digibank.application.client.WorkflowClient;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.org.OrgScope;
import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.security.AuthenticatedUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The staff queues and dashboard feeds, driven by the workflow definition as in the Worker (applications.ts
 * queueWhere / queueRows): the first queue key the caller may open decides which statuses are listed, whether the
 * caller's org scope narrows them and whether cases referred above the caller's rank are hidden. Rows carry
 * {@code workflow} (stage, owner, SLA clock); ?owner=me or ?owner=unassigned narrows the list.
 */
@Service
public class QueueService {

    private static final Logger log = LoggerFactory.getLogger(QueueService.class);

    public enum Order { SUBMITTED_ASC, UPDATED_DESC }

    private final WorkflowClient workflow;
    private final LoanApplicationRepository repository;
    private final OrgScope orgScope;
    private final RoleLadderClient ladder;
    private final ObjectMapper mapper;

    public QueueService(WorkflowClient workflow, LoanApplicationRepository repository, OrgScope orgScope, RoleLadderClient ladder, ObjectMapper mapper) {
        this.workflow = workflow;
        this.repository = repository;
        this.orgScope = orgScope;
        this.ladder = ladder;
        this.mapper = mapper;
    }

    /** The cases of the first of {@code keys} the caller may open (403 if none), filtered as the definition says. */
    public List<LoanApplication> cases(AuthenticatedUser user, List<String> keys, Order order) {
        QueueSettings q = workflow.resolveQueue(keys, WorkflowActor.of(user));
        List<LoanApplication> apps = order == Order.SUBMITTED_ASC
                ? repository.findByStatusInOrderBySubmittedAtAsc(q.statuses())
                : repository.findByStatusInOrderByUpdatedAtDesc(q.statuses());
        if (q.applyScope()) apps = orgScope.filter(user, apps);
        if (q.hideReferredAbove()) apps = hideReferredAbove(user, apps);
        return apps;
    }

    /** A case referred up the ladder leaves the queues of roles below its target. Roles not on the ladder (no rank) are unrestricted. */
    List<LoanApplication> hideReferredAbove(AuthenticatedUser user, List<LoanApplication> apps) {
        if (user.rank() == null) return apps;
        Set<String> above = Set.copyOf(ReferralLadder.roleCodesAbove(ladder.ladder(), user.rank()));
        if (above.isEmpty()) return apps;
        return apps.stream().filter(a -> !(ReferralLadder.REFERRED.equals(a.getStatus()) && a.getReferredToRole() != null && above.contains(a.getReferredToRole()))).toList();
    }

    /** {@link #cases} with each row's {@code workflow} info, and the ?owner filter. */
    public List<Map<String, Object>> rows(AuthenticatedUser user, List<String> keys, Order order, String owner) {
        List<LoanApplication> apps = cases(user, keys, order);
        Map<String, Map<String, Object>> info = Map.of();
        if (!apps.isEmpty()) {
            try {
                info = workflow.info(apps.stream().map(LoanApplication::getApplicationRef).toList());
            } catch (RuntimeException e) {
                // stage / owner / SLA decorate the rows; the list itself does not depend on them
                log.warn("Could not load workflow info for a queue ({} cases): {}", apps.size(), e.getMessage());
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (LoanApplication a : apps) {
            @SuppressWarnings("unchecked")
            Map<String, Object> row = new LinkedHashMap<>(mapper.convertValue(a, Map.class));
            Map<String, Object> w = info.get(a.getApplicationRef());
            row.put("workflow", w);
            if ("me".equals(owner) && !(w != null && w.get("assigneeUserId") instanceof Number n && user.userId() != null && n.longValue() == user.userId())) continue;
            if ("unassigned".equals(owner) && w != null && w.get("assigneeUserId") != null) continue;
            out.add(row);
        }
        return out;
    }
}
