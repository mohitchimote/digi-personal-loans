package com.digibank.workflow.repository;

import com.digibank.workflow.model.WfCaseTrack;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Collection;

public interface WfCaseTrackRepository extends JpaRepository<WfCaseTrack, WfCaseTrack.Key> {
    List<WfCaseTrack> findByApplicationRef(String applicationRef);

    List<WfCaseTrack> findByApplicationRefIn(Collection<String> refs);

    List<WfCaseTrack> findByAssigneeUserIdInAndTrackKey(Collection<Long> userIds, String trackKey);

    long countByTrackKeyAndStatus(String trackKey, String status);
}
