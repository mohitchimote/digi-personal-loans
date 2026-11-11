package com.digibank.application.audittrail;

import com.digibank.application.model.UnderwritingNote;
import com.digibank.application.repository.UnderwritingNoteRepository;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Audit-trail context (ARCHITECTURE.md §10) — the record of who did what, when: the underwriting notes shown in
 * the UI. Every note is written by a workflow action's NOTE effect (see workflow.WorkflowActions), inside that
 * action's transaction; the customer notification and email a clarification or document request used to send from
 * here are now the same action's NOTIFY and EMAIL effects. The compliance audit row for a note is written by the
 * action once it has committed, so a rolled-back action leaves none.
 */
@Service
public class AuditTrailService {

    private final UnderwritingNoteRepository noteRepository;

    public AuditTrailService(UnderwritingNoteRepository noteRepository) {
        this.noteRepository = noteRepository;
    }

    /** Inserts the note; joins the caller's transaction. */
    public UnderwritingNote saveNote(String appRef, String section, String note, String noteType, String createdBy) {
        UnderwritingNote entity = new UnderwritingNote();
        entity.setApplicationRef(appRef);
        entity.setSection(section);
        entity.setNote(note);
        entity.setNoteType(noteType);
        entity.setCreatedBy(createdBy);
        return noteRepository.save(entity);
    }

    public List<UnderwritingNote> getNotes(String appRef) {
        return noteRepository.findByApplicationRefOrderByCreatedAtDesc(appRef);
    }
}
