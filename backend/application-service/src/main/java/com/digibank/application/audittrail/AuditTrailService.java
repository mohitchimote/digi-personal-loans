package com.digibank.application.audittrail;

import com.digibank.application.client.EmailClient;
import com.digibank.application.client.NotificationClient;
import com.digibank.application.client.NotificationText;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.model.UnderwritingNote;
import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.repository.UnderwritingNoteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * Audit-trail context (ARCHITECTURE.md §10) — the record of who did what, when. Called from both
 * the wizard context (an underwriter editing a section leaves a note) and the decisioning context
 * (every decline/send-back/approve/refer/disbursement action leaves one), so this stays a small,
 * standalone service both can depend on rather than living inside either.
 */
@Service
public class AuditTrailService {

    private final LoanApplicationRepository repository;
    private final UnderwritingNoteRepository noteRepository;
    private final NotificationClient notificationClient;
    private final NotificationText text;
    private final EmailClient emailClient;

    public AuditTrailService(LoanApplicationRepository repository, UnderwritingNoteRepository noteRepository,
                              NotificationClient notificationClient, NotificationText text, EmailClient emailClient) {
        this.repository = repository;
        this.noteRepository = noteRepository;
        this.notificationClient = notificationClient;
        this.text = text;
        this.emailClient = emailClient;
    }

    @Transactional
    public UnderwritingNote addNote(String appRef, String section, String note, String noteType, String createdBy) {
        LoanApplication app = getByRef(appRef);
        UnderwritingNote entity = new UnderwritingNote();
        entity.setApplicationRef(appRef);
        entity.setSection(section);
        entity.setNote(note);
        entity.setNoteType(noteType);
        entity.setCreatedBy(createdBy);
        UnderwritingNote saved = noteRepository.save(entity);

        if ("CLARIFICATION_REQUEST".equals(noteType) || "DOCUMENT_REQUEST".equals(noteType)) {
            boolean isDocRequest = "DOCUMENT_REQUEST".equals(noteType);
            notificationClient.send(app.getCustomerId(),
                    isDocRequest ? "Document Required for Your Loan Application" : "Clarification Needed on Your Loan Application",
                    text.greeting(app) + " Thank you for applying for a personal loan for " + text.loanPurpose(app) + " with DigiBank. "
                            + "Our underwriting team is reviewing your " + text.sectionLabel(section) + " details and needs "
                            + (isDocRequest ? "an additional document" : "some clarification") + " before we can proceed.\n\n"
                            + "Underwriter's note: " + note + "\n\n"
                            + "Next steps: " + (isDocRequest
                                ? "Please log in to your DigiBank portal and upload the requested document from the Documents section."
                                : "Please log in to your DigiBank portal, review your application, and update the relevant section.")
                            + " Once done, your application will be back in the underwriting queue.",
                    "APPLICATION_UPDATE", appRef);

            Map<String, String> variables = text.commonEmailVariables(app);
            variables.put("underwriterNote", note);
            variables.put("sectionName", text.sectionLabel(section));
            // eventKey === noteType here, matching worker's dynamic sendTemplatedEmail(db, env,
            // noteType, ...) call — CLARIFICATION_REQUEST/DOCUMENT_REQUEST are both valid eventKeys
            // in EVENT_REGISTRY.
            emailClient.send(noteType, app.getCustomerEmail(), variables);
        }

        return saved;
    }

    public List<UnderwritingNote> getNotes(String appRef) {
        return noteRepository.findByApplicationRefOrderByCreatedAtDesc(appRef);
    }

    private LoanApplication getByRef(String appRef) {
        return repository.findByApplicationRef(appRef)
                .orElseThrow(() -> new IllegalArgumentException("Application not found: " + appRef));
    }
}
