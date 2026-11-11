package com.digibank.application.wizard;

import com.digibank.application.client.ProductClient;
import com.digibank.application.formbuilder.FormVersionService;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.digibank.application.security.AuthenticatedUser;
import com.digibank.application.workflow.WorkflowActions;
import com.digibank.application.workflow.WorkflowActions.Run;
import com.digibank.application.workflow.WorkflowCases;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** The wizard's state changes are workflow actions; the data it owns is written in the same transaction as the action. */
class WizardServiceWorkflowTest {

    static final AuthenticatedUser CUSTOMER = new AuthenticatedUser("c-7", 7L, "CUSTOMER", "Noa Levi", Set.of(), null, null, null, null, "noa@x.test");

    final LoanApplicationRepository repo = mock(LoanApplicationRepository.class);
    final WorkflowActions actions = mock(WorkflowActions.class);
    final WorkflowCases cases = mock(WorkflowCases.class);
    final SectionDataValidator validator = mock(SectionDataValidator.class);
    final FormVersionService forms = mock(FormVersionService.class);
    final ProductClient products = mock(ProductClient.class);
    WizardService service;
    LoanApplication app;

    @BeforeEach
    void setUp() {
        service = new WizardService(repo, new ObjectMapper().findAndRegisterModules(), products, actions, cases, validator, forms);
        app = LoanApplication.builder().applicationRef("APP-1").customerId(7L).customerEmail("noa@x.test").status("IN_PROGRESS").applicationType("PERSONAL")
                .currentSection("loanRequirements").completionPercentage(0).build();
        when(repo.findByApplicationRef("APP-1")).thenReturn(Optional.of(app));
        when(forms.resolveActive(any())).thenReturn(Optional.empty());
        when(actions.run(eq("APP-1"), any())).thenReturn(new WorkflowActions.Result(app, null));
    }

    private Run captured() {
        ArgumentCaptor<Run> run = ArgumentCaptor.forClass(Run.class);
        verify(actions).run(eq("APP-1"), run.capture());
        return run.getValue();
    }

    @Test
    void submitWithdrawAndCancelAreTheirActionsForTheCaller() {
        service.submitApplication("APP-1", CUSTOMER);
        assertThat(captured().action()).isEqualTo("submit");
        assertThat(captured().actor().type()).isEqualTo("CUSTOMER");
        assertThat(captured().actor().userId()).isEqualTo(7L);
        clearInvocations(actions);
        service.withdrawApplication("APP-1", CUSTOMER);
        assertThat(captured().action()).isEqualTo("withdraw");
        clearInvocations(actions);
        service.cancelApplication("APP-1", CUSTOMER);
        assertThat(captured().action()).isEqualTo("cancel");
    }

    @Test
    void submittingPushesTheFreshSummaryToWorkflowServiceAfterwards() {
        service.submitApplication("APP-1", CUSTOMER);
        verify(cases).registerAfterCommit(app);
    }

    @Test
    void savingASectionWritesItTheNextSectionAndTheCompletionInTheActionsTransaction() {
        when(validator.validateAndSerialize(eq("loanRequirements"), anyMap())).thenReturn("{\"loanAmount\":1000}");
        service.saveSection("APP-1", CUSTOMER, "loanRequirements", Map.of("loanAmount", 1000));

        Run run = captured();
        assertThat(run.action()).isEqualTo("save_section");
        assertThat(app.getLoanRequirementsJson()).as("nothing is written before the engine has agreed").isNull();

        run.apply().accept(app);
        assertThat(app.getLoanRequirementsJson()).isEqualTo("{\"loanAmount\":1000}");
        assertThat(app.getCurrentSection()).isEqualTo("personalDetails");
        assertThat(app.getCompletionPercentage()).as("loanRequirements filled, guarantorDetails skippable: 2 of 10").isEqualTo(20);
        verify(cases).registerAfterCommit(app); // loanRequirements feeds the case summary
    }

    @Test
    void aSectionThatDoesNotFeedTheSummaryDoesNotPushIt() {
        when(validator.validateAndSerialize(eq("outgoings"), anyMap())).thenReturn("{}");
        service.saveSection("APP-1", CUSTOMER, "outgoings", Map.of());
        verifyNoInteractions(cases);
    }

    @Test
    void invalidSectionDataIsRefusedBeforeTheEngineIsAsked() {
        when(validator.validateAndSerialize(anyString(), anyMap())).thenThrow(new IllegalArgumentException("Invalid data for section 'outgoings'"));
        assertThatThrownBy(() -> service.saveSection("APP-1", CUSTOMER, "outgoings", Map.of())).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(actions);
    }

    @Test
    void anUnknownSectionIsRefusedBeforeTheEngineIsAsked() {
        assertThatThrownBy(() -> service.saveSection("APP-1", CUSTOMER, "nonsense", Map.of())).hasMessage("Unknown section: nonsense");
        verifyNoInteractions(actions);
    }

    @Test
    void anUnderwritersEditIsTheEditSectionActionWithTheSectionAsInput() {
        AuthenticatedUser staff = new AuthenticatedUser("s", 50L, "UNDERWRITER", "Una", Set.of("case.editSection"), "ALL", null, 1, "Underwriter", null);
        when(validator.validateAndSerialize(eq("outgoings"), anyMap())).thenReturn("{\"monthlyRent\":5}");
        service.saveSectionByUnderwriter("APP-1", staff, "outgoings", Map.of("monthlyRent", 5));
        Run run = captured();
        assertThat(run.action()).isEqualTo("edit_section");
        assertThat(run.input()).containsEntry("section", "outgoings");
        assertThat(run.actor().type()).isEqualTo("STAFF");
        run.apply().accept(app);
        assertThat(app.getOutgoingsJson()).isEqualTo("{\"monthlyRent\":5}");
        assertThat(app.getCurrentSection()).as("an edit does not move the customer's place in the wizard").isEqualTo("loanRequirements");
    }

    @Test
    void selectingAProductStoresTheChoiceAndIsTheSelectProductAction() {
        service.selectProduct("APP-1", CUSTOMER, Map.of("productId", "P-7", "productName", "Flex"));
        Run run = captured();
        assertThat(run.action()).isEqualTo("select_product");
        run.apply().accept(app);
        assertThat(app.getSelectedProductId()).isEqualTo("P-7");
        assertThat(app.getSelectedProductJson()).contains("\"productName\":\"Flex\"");
    }

    @Test
    void aProductWithNoIdStoresAnEmptyId() {
        service.selectProduct("APP-1", CUSTOMER, Map.of("productName", "Flex"));
        captured().apply().accept(app);
        assertThat(app.getSelectedProductId()).isEmpty();
    }

    @Test
    void aNewApplicationIsRegisteredWithWorkflowServiceButAResumedOneIsNot() {
        when(repo.findFirstByCustomerIdAndStatusInOrderByUpdatedAtDesc(eq(7L), any())).thenReturn(Optional.empty());
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
        LoanApplication created = service.createOrResumeApplication(7L, "noa@x.test", null);
        verify(cases).registerAfterCommit(created);
        assertThat(created.getStatus()).isEqualTo("DRAFT");

        clearInvocations(cases);
        when(repo.findFirstByCustomerIdAndStatusInOrderByUpdatedAtDesc(eq(7L), any())).thenReturn(Optional.of(app));
        assertThat(service.createOrResumeApplication(7L, "noa@x.test", null)).isSameAs(app);
        verifyNoInteractions(cases);
    }

    @Test
    void aNewBusinessApplicationIsRegisteredToo() {
        when(repo.findFirstByCustomerIdAndStatusInOrderByUpdatedAtDesc(eq(7L), any())).thenReturn(Optional.empty());
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
        LoanApplication created = service.createOrResumeBusinessApplication(7L, "noa@x.test", 11L);
        verify(cases).registerAfterCommit(created);
        assertThat(created.getApplicationType()).isEqualTo("BUSINESS");
        assertThat(created.getOrgUnitId()).isEqualTo(11L);
    }

    @Test
    void aPreApprovedApplicationIsRegisteredAsInProgress() {
        when(products.getPreApprovedOffer("123456789")).thenReturn(Map.of("amount", 20000, "termMonths", 36, "productCode", "PL1", "productName", "Pre", "monthlyRepayment", 600,
                "totalRepayable", 21600, "annualInterestRate", 5.5));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
        LoanApplication created = service.createPreApprovedApplication(7L, "noa@x.test", "123456789");
        verify(cases).registerAfterCommit(created);
        assertThat(created.getStatus()).isEqualTo("IN_PROGRESS");
        verify(products).consumePreApprovedOffer("123456789");
    }
}
