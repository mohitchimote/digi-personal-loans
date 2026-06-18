package com.digibank.application.repository;

import com.digibank.application.model.UnderwritingNote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface UnderwritingNoteRepository extends JpaRepository<UnderwritingNote, Long> {
    List<UnderwritingNote> findByApplicationRefOrderByCreatedAtDesc(String applicationRef);
}
