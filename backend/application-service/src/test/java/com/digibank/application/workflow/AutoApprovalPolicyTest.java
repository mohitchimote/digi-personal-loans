package com.digibank.application.workflow;

import com.digibank.application.client.AffordabilityClient;
import com.digibank.application.model.LoanApplication;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The threshold test the RUN_AUTO_APPROVAL effect leaves to the host (the Worker's maybeAutoApprove). */
class AutoApprovalPolicyTest {

    final AffordabilityClient affordability = mock(AffordabilityClient.class);
    final AutoApprovalPolicy policy = new AutoApprovalPolicy(affordability, new ObjectMapper());
    LoanApplication app;

    @BeforeEach
    void setUp() {
        app = LoanApplication.builder().applicationRef("A").customerId(1L).customerEmail("c@x").applicationType("PERSONAL").build();
        app.setAffordabilityResultJson("{\"passed\":true}");
        app.setLoanRequirementsJson("{\"loanAmount\":20000}");
        when(affordability.getAutoApprovalThreshold(false)).thenReturn(new BigDecimal("30000"));
        when(affordability.getAutoApprovalThreshold(true)).thenReturn(new BigDecimal("10000"));
    }

    @Test
    void anAmountWithinTheThresholdIsApprovedForTheRequestedAmount() {
        assertThat(policy.approvedAmountFor(app)).hasValueSatisfying(a -> assertThat(a).isEqualByComparingTo("20000"));
    }

    @Test
    void anAmountExactlyAtTheThresholdIsStillApproved() {
        app.setLoanRequirementsJson("{\"loanAmount\":30000}");
        assertThat(policy.approvedAmountFor(app)).isPresent();
    }

    @Test
    void anAmountAboveTheThresholdIsNot() {
        app.setLoanRequirementsJson("{\"loanAmount\":30000.01}");
        assertThat(policy.approvedAmountFor(app)).isEmpty();
    }

    @Test
    void aJointApplicationUsesTheJointThreshold() {
        app.setPersonalDetailsJson("{\"applicant2\":{\"firstName\":\"Dan\"}}");
        assertThat(policy.approvedAmountFor(app)).as("20000 > 10000").isEmpty();
        app.setPersonalDetailsJson("{\"applicant2\":null}");
        assertThat(policy.approvedAmountFor(app)).as("a null applicant2 is a single application").isPresent();
    }

    @Test
    void aBusinessLoanIsAlwaysManual() {
        app.setApplicationType("BUSINESS");
        assertThat(policy.approvedAmountFor(app)).isEmpty();
        verifyNoInteractions(affordability);
    }

    @Test
    void aFailedOrMissingAffordabilityResultIsManual() {
        app.setAffordabilityResultJson("{\"passed\":false}");
        assertThat(policy.approvedAmountFor(app)).isEmpty();
        app.setAffordabilityResultJson(null);
        assertThat(policy.approvedAmountFor(app)).isEmpty();
    }

    @Test
    void noThresholdOrAnyFailureIsManual() {
        when(affordability.getAutoApprovalThreshold(anyBoolean())).thenReturn(null);
        assertThat(policy.approvedAmountFor(app)).isEmpty();
        when(affordability.getAutoApprovalThreshold(anyBoolean())).thenThrow(new IllegalStateException("down"));
        assertThat(policy.approvedAmountFor(app)).isEmpty();
        app.setAffordabilityResultJson("{ broken");
        assertThat(policy.approvedAmountFor(app)).isEmpty();
    }
}
