package com.digibank.application.workflow;

import com.digibank.application.model.LoanApplication;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class CaseSummariesTest {

    final CaseSummaries s = new CaseSummaries(new ObjectMapper().findAndRegisterModules());

    private static LoanApplication personal() {
        LoanApplication a = LoanApplication.builder().applicationRef("A-1").customerId(7L).customerEmail("c@x").status("SUBMITTED").applicationType("PERSONAL").orgUnitId(3L).build();
        a.setLoanRequirementsJson("{\"loanAmount\":25000.5,\"loanPurpose\":\"Car\",\"loanTerm\":36}");
        a.setPersonalDetailsJson("{\"firstName\":\"Noa\",\"lastName\":\"Levi\"}");
        return a;
    }

    @Test
    void aPersonalSummaryReadsLoanRequirementsAndTheApplicantsName() {
        assertThat(s.summaryOf(personal())).containsEntry("applicantName", "Noa Levi").containsEntry("amount", 25000.5).containsEntry("purpose", "Car")
                .containsEntry("termMonths", 36).containsEntry("applicationType", "PERSONAL").containsEntry("customerId", 7L).containsEntry("orgUnitId", 3L)
                .containsEntry("guarantorRequired", false).containsEntry("guarantorDetailsPresent", false);
    }

    @Test
    void aBusinessSummaryReadsCompanyDetails() {
        LoanApplication a = LoanApplication.builder().applicationRef("B-1").customerId(8L).customerEmail("c@x").applicationType("BUSINESS").build();
        a.setCompanyDetailsJson("{\"companyName\":\"Acme Ltd\",\"loanAmount\":900000,\"loanPurpose\":\"Fleet\",\"loanTerm\":60}");
        assertThat(s.summaryOf(a)).containsEntry("applicantName", "Acme Ltd").containsEntry("amount", 900000.0).containsEntry("purpose", "Fleet")
                .containsEntry("termMonths", 60).containsEntry("applicationType", "BUSINESS");
    }

    @Test
    void missingOrBrokenSectionDataGivesNullsNotErrors() {
        LoanApplication a = LoanApplication.builder().applicationRef("A-2").customerId(7L).customerEmail("c@x").build();
        a.setPersonalDetailsJson("not json");
        assertThat(s.summaryOf(a)).containsEntry("applicantName", null).containsEntry("amount", null).containsEntry("purpose", null).containsEntry("termMonths", null);
    }

    @Test
    void theEngineFieldsComeFromTheApplicationRowItself() {
        LoanApplication a = personal();
        a.setReferredToRole("COO");
        a.setApprovedAmount(new BigDecimal("1000"));
        a.setGuarantorRequired(true);
        a.setGuarantorDetailsJson("{}");
        a.setCurrentSection("guarantorDetails");
        assertThat(s.fieldsOf(a)).containsOnlyKeys("referredToRole", "approvedAmount", "guarantorRequired", "guarantorDetailsPresent", "currentSection")
                .containsEntry("referredToRole", "COO").containsEntry("approvedAmount", 1000.0).containsEntry("guarantorRequired", true)
                .containsEntry("guarantorDetailsPresent", true).containsEntry("currentSection", "guarantorDetails");
    }

    @Test
    void aRegistrationAddsWhereTheCaseIsNowAndWhenItLastChanged() {
        LoanApplication a = personal();
        a.setDisbursementStatus("SECOND_CHECK_PENDING");
        a.setUpdatedAt(LocalDateTime.of(2026, 11, 1, 10, 0));
        assertThat(s.registrationOf(a)).containsEntry("status", "SUBMITTED").containsEntry("disbursementStatus", "SECOND_CHECK_PENDING")
                .containsEntry("applicationRef", "A-1").containsKey("enteredAt");
        assertThat((String) s.registrationOf(a).get("enteredAt")).matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z");
    }

    @Test
    void isoTimestampsRoundTrip() {
        LocalDateTime t = LocalDateTime.of(2026, 11, 11, 10, 15, 30, 123_000_000);
        assertThat(CaseSummaries.parseIso(CaseSummaries.iso(t))).isEqualTo(t);
        assertThat(CaseSummaries.parseIso("garbage")).isNotNull();
    }
}
