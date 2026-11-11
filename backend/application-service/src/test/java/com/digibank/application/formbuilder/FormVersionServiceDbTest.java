package com.digibank.application.formbuilder;

import com.digibank.application.compliance.ComplianceAuditWriter;
import com.digibank.application.config.ApiException;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

@AppDbTest
class FormVersionServiceDbTest {

    static final String PERSONAL = "personal-loan-wizard";
    static final String BUSINESS = "business-loan-wizard";

    @Autowired FormVersionRepository repository;
    @Autowired LoanApplicationRepository applications;

    ComplianceAuditWriter audit = mock(ComplianceAuditWriter.class);
    FormVersionService service;

    @BeforeEach
    void service() {
        service = new FormVersionService(repository, new FormSchemaValidator(), new ObjectMapper(), audit);
    }

    // ---- seeding -----------------------------------------------------------------------------------

    @Test
    void firstStartPublishesVersionOneOfBothForms() {
        assertThat(service.seedDefaults()).isEqualTo(2);
        for (String formKey : List.of(PERSONAL, BUSINESS)) {
            List<FormVersion> versions = service.list(formKey);
            assertThat(versions).hasSize(1);
            FormVersion v = versions.get(0);
            assertThat(v.getVersion()).isEqualTo(1);
            assertThat(v.getStatus()).isEqualTo("PUBLISHED");
            assertThat(v.getCreatedBy()).isEqualTo("seed-script");
            assertThat(v.getPublishedBy()).isEqualTo("seed-script");
            assertThat(v.getPublishedAt()).isNotNull();
            assertThat(v.getChangeNote()).isEqualTo("Initial version — encodes the existing hardcoded wizard as-is.");
            assertThat(service.parse(v)).as("seeded schema parses").isNotNull();
        }
    }

    @Test
    void seedingTwiceChangesNothing() {
        service.seedDefaults();
        assertThat(service.seedDefaults()).isZero();
        assertThat(repository.count()).isEqualTo(2);
    }

    @Test
    void seedingNeverTouchesAFormThatAlreadyHasAnyVersion() {
        FormVersion archived = new FormVersion();
        archived.setFormKey(PERSONAL);
        archived.setVersion(7);
        archived.setStatus("ARCHIVED");
        archived.setSchemaJson("{\"sections\":[]}");
        archived.setCreatedAt("2026-01-01T00:00:00.000Z");
        repository.save(archived);

        assertThat(service.seedDefaults()).isEqualTo(1); // only the business form
        assertThat(service.list(PERSONAL)).hasSize(1);
        assertThat(service.getPublished(PERSONAL)).isEmpty();
        assertThat(service.getPublished(BUSINESS)).isPresent();
    }

    // ---- drafts ------------------------------------------------------------------------------------

    @Test
    void aNewDraftCopiesThePublishedSchemaAndTakesTheNextVersionNumber() {
        service.seedDefaults();
        FormVersion published = service.getPublished(PERSONAL).orElseThrow();
        FormVersion draft = service.createDraftFrom(PERSONAL, null, "admin@digibank.test");
        assertThat(draft.getVersion()).isEqualTo(2);
        assertThat(draft.getStatus()).isEqualTo("DRAFT");
        assertThat(draft.getSchemaJson()).isEqualTo(published.getSchemaJson());
        assertThat(draft.getCreatedBy()).isEqualTo("admin@digibank.test");
        assertThat(draft.getPublishedAt()).isNull();
        assertThat(service.createDraftFrom(PERSONAL, null, "a").getVersion()).isEqualTo(3);
    }

    @Test
    void aDraftCanBeCopiedFromAnySpecificVersionOrStartEmpty() {
        // only PERSONAL is seeded here, so BUSINESS has nothing published
        service.seedDefaults();
        repository.deleteAll(repository.findByFormKeyOrderByVersionDesc(BUSINESS));
        FormVersion v1 = service.getPublished(PERSONAL).orElseThrow();
        FormVersion editable = service.createDraftFrom(PERSONAL, null, "a");
        service.updateDraft(editable.getId(), "{\"sections\":[]}", false, null);
        FormVersion fromV1 = service.createDraftFrom(PERSONAL, v1.getId(), "a");
        assertThat(fromV1.getSchemaJson()).isEqualTo(v1.getSchemaJson());
        assertThat(service.createDraftFrom(PERSONAL, 9999L, "a").getSchemaJson()).isEqualTo("{\"sections\":[]}");
        // a form with nothing published starts from an empty schema
        assertThat(service.createDraftFrom(BUSINESS, null, "a").getSchemaJson()).isEqualTo("{\"sections\":[]}");
    }

    @Test
    void updatingADraftValidatesTheSchemaAndKeepsTheNoteUnlessGiven() {
        FormVersion draft = service.createDraftFrom(PERSONAL, null, "a");
        service.updateDraft(draft.getId(), null, true, "first note");
        assertThat(service.getById(draft.getId()).orElseThrow().getChangeNote()).isEqualTo("first note");

        String schema = "{\"sections\":[{\"key\":\"outgoings\",\"order\":1,\"sideMenuLabelKey\":\"k\",\"sectionHeaders\":[],\"fields\":[]}]}";
        FormVersion updated = service.updateDraft(draft.getId(), schema, false, null);
        assertThat(updated.getSchemaJson()).isEqualTo(schema);
        assertThat(updated.getChangeNote()).isEqualTo("first note");

        assertThat(service.updateDraft(draft.getId(), null, true, null).getChangeNote()).isNull();
        assertThat(service.updateDraft(draft.getId(), "", false, null).getSchemaJson()).isEqualTo(schema); // empty = unchanged
    }

    @Test
    void aMalformedSchemaIsRefusedAndNothingIsSaved() {
        FormVersion draft = service.createDraftFrom(PERSONAL, null, "a");
        assertThatThrownBy(() -> service.updateDraft(draft.getId(), "{\"sections\":[],\"bogus\":1}", false, null))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("bogus");
        assertThatThrownBy(() -> service.updateDraft(draft.getId(), "not json", false, null))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("not valid JSON");
        assertThat(service.getById(draft.getId()).orElseThrow().getSchemaJson()).isEqualTo("{\"sections\":[]}");
    }

    @Test
    void onlyADraftCanBeEditedDiscardedOrPublished() {
        service.seedDefaults();
        FormVersion published = service.getPublished(PERSONAL).orElseThrow();
        assertThatThrownBy(() -> service.updateDraft(published.getId(), null, true, "x")).isInstanceOfSatisfying(ApiException.class,
                e -> { assertThat(e.getStatus()).isEqualTo(400); assertThat(e.getMessage()).isEqualTo("Only a draft version can be edited."); });
        assertThatThrownBy(() -> service.discardDraft(published.getId())).isInstanceOfSatisfying(ApiException.class,
                e -> { assertThat(e.getStatus()).isEqualTo(400); assertThat(e.getMessage()).isEqualTo("Only a draft version can be discarded."); });
        assertThatThrownBy(() -> service.publish(published.getId(), "a")).isInstanceOfSatisfying(ApiException.class,
                e -> { assertThat(e.getStatus()).isEqualTo(400); assertThat(e.getMessage()).isEqualTo("Only a draft version can be published."); });
    }

    @Test
    void anUnknownVersionIsA404() {
        for (Runnable r : List.<Runnable>of(() -> service.updateDraft(99L, null, true, "x"), () -> service.discardDraft(99L),
                () -> service.publish(99L, "a"))) {
            assertThatThrownBy(r::run).isInstanceOfSatisfying(ApiException.class,
                    e -> { assertThat(e.getStatus()).isEqualTo(404); assertThat(e.getMessage()).isEqualTo("Form version not found."); });
        }
    }

    @Test
    void discardingADraftDeletesIt() {
        FormVersion draft = service.createDraftFrom(PERSONAL, null, "a");
        service.discardDraft(draft.getId());
        assertThat(service.getById(draft.getId())).isEmpty();
    }

    // ---- publishing --------------------------------------------------------------------------------

    @Test
    void publishingArchivesThePreviousVersionAndLeavesExactlyOnePublished() {
        service.seedDefaults();
        FormVersion v1 = service.getPublished(PERSONAL).orElseThrow();
        FormVersion draft = service.createDraftFrom(PERSONAL, null, "a");
        service.updateDraft(draft.getId(), null, true, "Added a field");

        FormVersion published = service.publish(draft.getId(), "admin@digibank.test");
        assertThat(published.getStatus()).isEqualTo("PUBLISHED");
        assertThat(published.getPublishedBy()).isEqualTo("admin@digibank.test");
        assertThat(published.getPublishedAt()).isNotNull();
        assertThat(service.getById(v1.getId()).orElseThrow().getStatus()).isEqualTo("ARCHIVED");
        assertThat(service.list(PERSONAL).stream().filter(v -> v.getStatus().equals("PUBLISHED"))).hasSize(1);
        assertThat(service.getPublished(BUSINESS)).as("the other form is untouched").isPresent();
        verify(audit).record("FORM_VERSION_PUBLISHED", "form_versions", String.valueOf(draft.getId()), "admin@digibank.test", "ADMIN",
                "personal-loan-wizard v2: Added a field");
    }

    @Test
    void theFirstEverPublishNeedsNothingToArchive() {
        FormVersion draft = service.createDraftFrom(BUSINESS, null, "a");
        assertThat(service.publish(draft.getId(), "a").getStatus()).isEqualTo("PUBLISHED");
        verify(audit).record("FORM_VERSION_PUBLISHED", "form_versions", String.valueOf(draft.getId()), "a", "ADMIN", "business-loan-wizard v1");
    }

    // ---- which version a case is judged against -----------------------------------------------------

    @Test
    void anInFlightCaseSeesWhateverIsPublishedNowAndASubmittedOneItsFrozenVersion() {
        service.seedDefaults();
        FormVersion v1 = service.getPublished(PERSONAL).orElseThrow();
        LoanApplication app = LoanApplication.builder().applicationRef("A-1").customerId(1L).customerEmail("e").applicationType("PERSONAL").build();

        assertThat(service.resolveActive(app).orElseThrow().getId()).isEqualTo(v1.getId());

        app.setFormVersionId(v1.getId()); // frozen at submit
        FormVersion draft = service.createDraftFrom(PERSONAL, null, "a");
        service.publish(draft.getId(), "a");
        assertThat(service.resolveActive(app).orElseThrow().getId()).as("frozen on the case").isEqualTo(v1.getId());

        app.setFormVersionId(null); // withdrawn: back to the live version
        assertThat(service.resolveActive(app).orElseThrow().getId()).isEqualTo(draft.getId());
    }

    @Test
    void aBusinessCaseResolvesTheBusinessForm() {
        service.seedDefaults();
        LoanApplication app = LoanApplication.builder().applicationRef("A-2").customerId(1L).customerEmail("e").applicationType("BUSINESS").build();
        assertThat(service.resolveActive(app).orElseThrow().getFormKey()).isEqualTo(BUSINESS);
        assertThat(FormVersionService.formKeyFor("PERSONAL")).isEqualTo(PERSONAL);
    }

    @Test
    void aMalformedSchemaOnTheResolvedVersionParsesToNullNotAnError() {
        FormVersion v = new FormVersion();
        v.setFormKey(PERSONAL);
        v.setVersion(1);
        v.setStatus("PUBLISHED");
        v.setSchemaJson("{\"sections\":[],\"bogus\":1}");
        v.setCreatedAt("x");
        assertThat(service.parse(repository.save(v))).isNull();
        v.setSchemaJson("not json");
        assertThat(service.parse(v)).isNull();
    }

    // ---- the case table -----------------------------------------------------------------------------

    @Test
    void casesAreCountedPerOrgUnit() {
        applications.save(LoanApplication.builder().applicationRef("C-1").customerId(1L).customerEmail("e").orgUnitId(10L).build());
        applications.save(LoanApplication.builder().applicationRef("C-2").customerId(2L).customerEmail("e").orgUnitId(10L).build());
        applications.save(LoanApplication.builder().applicationRef("C-3").customerId(3L).customerEmail("e").orgUnitId(11L).build());
        applications.save(LoanApplication.builder().applicationRef("C-4").customerId(4L).customerEmail("e").build());
        assertThat(applications.countByOrgUnitId(10L)).isEqualTo(2);
        assertThat(applications.countByOrgUnitId(11L)).isEqualTo(1);
        assertThat(applications.countByOrgUnitId(99L)).isZero();
    }

    @Test
    void theNewCaseColumnsRoundTripWithTheirDefaults() {
        LoanApplication saved = applications.saveAndFlush(
                LoanApplication.builder().applicationRef("C-9").customerId(9L).customerEmail("e").orgUnitId(5L).build());
        LoanApplication loaded = applications.findByApplicationRef("C-9").orElseThrow();
        assertThat(loaded.getOrgUnitId()).isEqualTo(5L);
        assertThat(loaded.getFormVersionId()).isNull();
        assertThat(loaded.getAutoApproved()).isFalse();
        assertThat(loaded.getReferredToRole()).isNull();
        assertThat(saved.getId()).isNotNull();
    }
}
