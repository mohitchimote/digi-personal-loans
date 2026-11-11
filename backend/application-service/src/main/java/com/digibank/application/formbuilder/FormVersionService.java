package com.digibank.application.formbuilder;

import com.digibank.application.compliance.ComplianceAuditWriter;
import com.digibank.application.config.ApiException;
import com.digibank.application.model.LoanApplication;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

/**
 * The form version lifecycle (DRAFT, PUBLISHED, ARCHIVED) and the resolution of which version a case
 * is judged against: a port of worker/src/lib/form-versions.ts. A submitted case carries the version
 * frozen onto it (formVersionId); a case still in flight always sees whatever is published now.
 */
@Service
public class FormVersionService {

    static final String SEED_NOTE = "Initial version — encodes the existing hardcoded wizard as-is.";
    static final String SEED_ACTOR = "seed-script";

    private final FormVersionRepository repository;
    private final FormSchemaValidator validator;
    private final ObjectMapper objectMapper;
    private final ComplianceAuditWriter audit;

    public FormVersionService(FormVersionRepository repository, FormSchemaValidator validator, ObjectMapper objectMapper,
                              ComplianceAuditWriter audit) {
        this.repository = repository;
        this.validator = validator;
        this.objectMapper = objectMapper;
        this.audit = audit;
    }

    public static String formKeyFor(String applicationType) {
        return "BUSINESS".equals(applicationType) ? "business-loan-wizard" : "personal-loan-wizard";
    }

    private static String now() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();
    }

    public Optional<FormVersion> getPublished(String formKey) {
        return repository.findFirstByFormKeyAndStatus(formKey, "PUBLISHED");
    }

    public Optional<FormVersion> getById(Long id) {
        return id == null ? Optional.empty() : repository.findById(id);
    }

    public List<FormVersion> list(String formKey) {
        return repository.findByFormKeyOrderByVersionDesc(formKey);
    }

    /** The version a case is judged against right now (see class comment); empty when none exists. */
    public Optional<FormVersion> resolveActive(LoanApplication app) {
        if (app.getFormVersionId() != null) return getById(app.getFormVersionId());
        return getPublished(formKeyFor(app.getApplicationType()));
    }

    /** The parsed, validated schema of a version, or null when it is malformed (never a broken page). */
    public JsonNode parse(FormVersion version) {
        try {
            JsonNode schema = objectMapper.readTree(version.getSchemaJson());
            return validator.validate(schema).isEmpty() ? schema : null;
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    @Transactional
    public FormVersion createDraftFrom(String formKey, Long sourceVersionId, String createdBy) {
        FormVersion source = (sourceVersionId != null ? getById(sourceVersionId) : getPublished(formKey)).orElse(null);
        List<FormVersion> siblings = list(formKey);
        int next = (siblings.isEmpty() ? 0 : siblings.get(0).getVersion()) + 1;
        FormVersion v = new FormVersion();
        v.setFormKey(formKey);
        v.setVersion(next);
        v.setStatus("DRAFT");
        v.setSchemaJson(source != null ? source.getSchemaJson() : "{\"sections\":[]}");
        v.setCreatedAt(now());
        v.setCreatedBy(createdBy);
        return repository.save(v);
    }

    /** @param changeNoteGiven whether the request carried a changeNote at all (null clears it, absent keeps it) */
    @Transactional
    public FormVersion updateDraft(Long id, String schemaJson, boolean changeNoteGiven, String changeNote) {
        FormVersion existing = getById(id).orElseThrow(() -> new ApiException(404, "Form version not found."));
        if (!"DRAFT".equals(existing.getStatus())) throw new ApiException(400, "Only a draft version can be edited.");
        if (schemaJson != null && !schemaJson.isEmpty()) {
            JsonNode parsed;
            try {
                parsed = objectMapper.readTree(schemaJson);
            } catch (JsonProcessingException e) {
                throw new IllegalArgumentException("Invalid form schema: not valid JSON.");
            }
            validator.assertValid(parsed);
            existing.setSchemaJson(schemaJson);
        }
        if (changeNoteGiven) existing.setChangeNote(changeNote);
        return repository.save(existing);
    }

    @Transactional
    public void discardDraft(Long id) {
        FormVersion existing = getById(id).orElseThrow(() -> new ApiException(404, "Form version not found."));
        if (!"DRAFT".equals(existing.getStatus())) throw new ApiException(400, "Only a draft version can be discarded.");
        repository.delete(existing);
    }

    /** Archives the current published version, then promotes the draft, in one transaction. */
    @Transactional
    public FormVersion publish(Long id, String publishedBy) {
        FormVersion draft = getById(id).orElseThrow(() -> new ApiException(404, "Form version not found."));
        if (!"DRAFT".equals(draft.getStatus())) throw new ApiException(400, "Only a draft version can be published.");

        getPublished(draft.getFormKey()).ifPresent(current -> {
            current.setStatus("ARCHIVED");
            repository.saveAndFlush(current);
        });
        draft.setStatus("PUBLISHED");
        draft.setPublishedAt(now());
        draft.setPublishedBy(publishedBy);
        FormVersion published = repository.save(draft);

        audit.record("FORM_VERSION_PUBLISHED", "form_versions", String.valueOf(id), publishedBy, "ADMIN",
                draft.getFormKey() + " v" + draft.getVersion()
                        + (draft.getChangeNote() != null && !draft.getChangeNote().isEmpty() ? ": " + draft.getChangeNote() : ""));
        return published;
    }

    /** Idempotent day-one seed: a PUBLISHED v1 per form that has no version at all (worker/seed-form-versions.sql). */
    @Transactional
    public int seedDefaults() {
        int created = 0;
        for (String formKey : FormSchemaValidator.FORM_KEYS) {
            if (!list(formKey).isEmpty()) continue;
            FormVersion v = new FormVersion();
            v.setFormKey(formKey);
            v.setVersion(1);
            v.setStatus("PUBLISHED");
            v.setSchemaJson(defaultSchemaJson(formKey));
            v.setChangeNote(SEED_NOTE);
            v.setCreatedAt(now());
            v.setCreatedBy(SEED_ACTOR);
            v.setPublishedAt(v.getCreatedAt());
            v.setPublishedBy(SEED_ACTOR);
            repository.save(v);
            created++;
        }
        return created;
    }

    public static String defaultSchemaJson(String formKey) {
        try {
            return new String(new ClassPathResource("form-versions/" + formKey + ".v1.json").getInputStream().readAllBytes(),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Missing default form schema for " + formKey, e);
        }
    }
}
