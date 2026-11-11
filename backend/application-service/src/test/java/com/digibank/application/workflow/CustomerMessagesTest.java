package com.digibank.application.workflow;

import com.digibank.application.client.DocumentClient;
import com.digibank.application.client.EmailClient;
import com.digibank.application.client.NotificationClient;
import com.digibank.application.client.NotificationText;
import com.digibank.application.model.LoanApplication;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** The wording of the customer-facing effects (the Worker's lib/workflow/messages.ts, in English). */
class CustomerMessagesTest {

    final NotificationClient notifications = mock(NotificationClient.class);
    final EmailClient emails = mock(EmailClient.class);
    final DocumentClient documents = mock(DocumentClient.class);
    CustomerMessages messages;
    LoanApplication app;

    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper();
        messages = new CustomerMessages(notifications, emails, documents, new NotificationText(mapper), mapper);
        app = LoanApplication.builder().applicationRef("APP-1").customerId(7L).customerEmail("noa@x.test").applicationType("PERSONAL").build();
        app.setPersonalDetailsJson("{\"firstName\":\"Noa\",\"lastName\":\"Levi\"}");
        app.setLoanRequirementsJson("{\"loanPurpose\":\"a car\",\"loanAmount\":20000}");
    }

    private String[] sent() {
        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class), message = ArgumentCaptor.forClass(String.class), type = ArgumentCaptor.forClass(String.class);
        verify(notifications).send(eq(7L), title.capture(), message.capture(), type.capture(), eq("APP-1"));
        return new String[]{title.getValue(), message.getValue(), type.getValue()};
    }

    @Test
    void declineNotificationCarriesTheReason() {
        messages.notify("DECISION_DECLINED", app, Map.of("reason", "too risky"));
        String[] s = sent();
        assertThat(s[0]).isEqualTo("Update on Your Loan Application");
        assertThat(s[2]).isEqualTo("APPLICATION_UPDATE");
        assertThat(s[1]).startsWith("Dear Noa, Thank you for applying for a personal loan for a car with DigiBank.").contains("Reason: too risky");
    }

    @Test
    void sendBackMentionsANewlyRequiredGuarantorOnlyWhenNoneIsOnFile() {
        messages.notify("SEND_BACK", app, Map.of("reason", "docs", "requireGuarantor", true, "guarantorDetailsPresent", false));
        assertThat(sent()[1]).contains("Underwriter's note: docs").contains("A guarantor is now required");

        clearInvocations(notifications);
        messages.notify("SEND_BACK", app, Map.of("reason", "docs", "requireGuarantor", true, "guarantorDetailsPresent", true));
        assertThat(sent()[1]).doesNotContain("guarantor");

        clearInvocations(notifications);
        messages.notify("SEND_BACK", app, Map.of("reason", "docs", "requireGuarantor", false));
        assertThat(sent()[1]).doesNotContain("guarantor");
    }

    @Test
    void approvalAndFundReleaseAreApprovalTypeNotifications() {
        messages.notify("DECISION_APPROVED", app, Map.of());
        assertThat(sent()[0]).isEqualTo("Your Loan Application Has Been Approved!");
        clearInvocations(notifications);
        messages.notify("DISBURSEMENT_AUTHORISED", app, Map.of());
        String[] s = sent();
        assertThat(s[0]).isEqualTo("Your Loan Funds Have Been Released");
        assertThat(s[2]).isEqualTo("APPROVAL");
    }

    @Test
    void clarificationAndDocumentRequestsNameTheSectionAndTheNote() {
        messages.notify("CLARIFICATION_REQUEST", app, Map.of("text", "explain", "section", "personalDetails"));
        String[] c = sent();
        assertThat(c[0]).isEqualTo("Clarification Needed on Your Loan Application");
        assertThat(c[1]).contains("Personal Details details and needs some clarification").contains("Underwriter's note: explain");
        clearInvocations(notifications);
        messages.notify("DOCUMENT_REQUEST", app, Map.of("text", "payslip", "section", "incomeEmployment"));
        String[] d = sent();
        assertThat(d[0]).isEqualTo("Document Required for Your Loan Application");
        assertThat(d[1]).contains("Income & Employment details and needs an additional document").contains("upload the requested document");
    }

    @Test
    void anUnknownTemplateSendsNothing() {
        messages.notify("NOT_A_TEMPLATE", app, Map.of());
        verifyNoInteractions(notifications);
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> emailVars(String event) {
        ArgumentCaptor<Map<String, String>> vars = ArgumentCaptor.forClass(Map.class);
        verify(emails).send(eq(event), eq("noa@x.test"), vars.capture());
        return vars.getValue();
    }

    @Test
    void everyEmailGetsTheCommonVariablesPlusItsOwn() {
        Map<String, Object> approved = new HashMap<>();
        approved.put("approvedAmount", new BigDecimal("25000"));
        approved.put("reviewedBy", "Una");
        messages.email("DECISION_APPROVED", app, approved);
        assertThat(emailVars("DECISION_APPROVED")).containsEntry("applicantName", "Noa").containsEntry("applicationRef", "APP-1").containsEntry("loanPurpose", "a car")
                .containsEntry("approvedAmount", "25000").containsEntry("reviewedBy", "Una");

        messages.email("DECISION_DECLINED", app, Map.of("declineReason", "no", "reviewedBy", "Una"));
        assertThat(emailVars("DECISION_DECLINED")).containsEntry("declineReason", "no").containsEntry("reviewedBy", "Una");

        messages.email("SEND_BACK", app, Map.of("sendBackReason", "r", "reviewedBy", "Una", "requireGuarantor", true, "guarantorDetailsPresent", false));
        assertThat(emailVars("SEND_BACK")).containsEntry("sendBackReason", "r").containsEntry("guarantorRequiredNote", " A guarantor is now required for this application — please complete the new Guarantor Details section, including a supporting document for your guarantor, before resubmitting.");

        messages.email("DISBURSEMENT_AUTHORISED", app, Map.of("reviewedBy", "Una"));
        assertThat(emailVars("DISBURSEMENT_AUTHORISED")).containsEntry("reviewedBy", "Una");

        messages.email("DOCUMENT_REQUEST", app, Map.of("underwriterNote", "n", "section", "verifyId"));
        assertThat(emailVars("DOCUMENT_REQUEST")).containsEntry("underwriterNote", "n").containsEntry("sectionName", "ID Verification");

        messages.email("SUBMITTED", app, Map.of());
        assertThat(emailVars("SUBMITTED")).containsOnlyKeys("applicantName", "applicationRef", "loanPurpose");

        messages.email("CUSTOM_EVENT", app, Map.of("a", 1));
        assertThat(emailVars("CUSTOM_EVENT")).containsEntry("a", "1");
    }

    @Test
    void anApprovedAmountThatIsAbsentIsAnEmptyString() {
        messages.email("DECISION_APPROVED", app, new HashMap<>());
        assertThat(emailVars("DECISION_APPROVED")).containsEntry("approvedAmount", "");
    }

    @Test
    void theApprovalLetterUsesTheApprovedAmountAndTheChosenProduct() {
        app.setSelectedProductJson("{\"productName\":\"Flex\",\"interestRate\":5.5,\"termMonths\":36,\"monthlyRepayment\":600}");
        app.setApprovedAmount(new BigDecimal("18000"));
        messages.generateApprovalLetter(app);
        verify(documents).generateFinalApprovalLetter("APP-1", 7L, "Noa Levi", 18000.0, "Flex", 5.5, 36, 600.0);
    }

    @Test
    void aBusinessLetterReadsTheCompanyAndFallsBackToTheAprAndTheRequestedAmount() {
        app.setApplicationType("BUSINESS");
        app.setCompanyDetailsJson("{\"companyName\":\"Acme\",\"loanAmount\":90000}");
        app.setSelectedProductJson("{\"productName\":\"Biz\",\"apr\":7.5,\"termMonths\":60,\"monthlyRepayment\":1800}");
        messages.generateApprovalLetter(app);
        verify(documents).generateFinalApprovalLetter("APP-1", 7L, "Acme", 90000.0, "Biz", 7.5, 60, 1800.0);
    }

    @Test
    void noProductMeansNoLetterAndABrokenSelectionNeverThrows() {
        messages.generateApprovalLetter(app);
        verifyNoInteractions(documents);
        app.setSelectedProductJson("{ not json");
        messages.generateApprovalLetter(app);
        verifyNoInteractions(documents);
    }
}
