package com.digibank.application.wizard;

import com.digibank.application.wizard.dto.section.BusinessCreditDeclarationsDto;
import com.digibank.application.wizard.dto.section.BusinessFinancialsDto;
import com.digibank.application.wizard.dto.section.BusinessOutgoingsDto;
import com.digibank.application.wizard.dto.section.CompanyDetailsDto;
import com.digibank.application.wizard.dto.section.ConnectBankDto;
import com.digibank.application.wizard.dto.section.ConnectBusinessBankDto;
import com.digibank.application.wizard.dto.section.ConsentManagementDto;
import com.digibank.application.wizard.dto.section.CreditDeclarationsDto;
import com.digibank.application.wizard.dto.section.DirectDebitDto;
import com.digibank.application.wizard.dto.section.GuarantorDetailsDto;
import com.digibank.application.wizard.dto.section.IncomeEmploymentDto;
import com.digibank.application.wizard.dto.section.LoanRequirementsDto;
import com.digibank.application.wizard.dto.section.OutgoingsDto;
import com.digibank.application.wizard.dto.section.PersonalDetailsDto;
import com.digibank.application.wizard.dto.section.ReviewSubmitDto;
import com.digibank.application.wizard.dto.section.SignatoriesDto;
import com.digibank.application.wizard.dto.section.VerifyIdDto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Channel-specific field exposure control (2026-09 architecture review, "Field Exposure
 * Controls"/"Channel-Specific Validation"): every section save must match that section's known
 * shape exactly — unrecognised fields are rejected (400), not silently stored. Worker-side
 * equivalent: worker/src/lib/section-schemas.ts (Zod). The DTOs here are that Zod schema set's
 * Jakarta Bean Validation mirror, one for one.
 *
 * Section-to-DTO dispatch instead of static @Valid annotations because the shape of `data`
 * depends on the sibling `section` field's value, which plain Bean Validation on a fixed request
 * DTO can't express.
 */
@Component
public class SectionDataValidator {

    private static final Map<String, Class<?>> SECTION_DTO_CLASSES = Map.ofEntries(
            Map.entry("loanRequirements", LoanRequirementsDto.class),
            Map.entry("consentManagement", ConsentManagementDto.class),
            Map.entry("personalDetails", PersonalDetailsDto.class),
            Map.entry("guarantorDetails", GuarantorDetailsDto.class),
            Map.entry("connectBank", ConnectBankDto.class),
            Map.entry("incomeEmployment", IncomeEmploymentDto.class),
            Map.entry("outgoings", OutgoingsDto.class),
            Map.entry("creditDeclarations", CreditDeclarationsDto.class),
            Map.entry("verifyId", VerifyIdDto.class),
            Map.entry("directDebit", DirectDebitDto.class),
            Map.entry("reviewSubmit", ReviewSubmitDto.class),
            Map.entry("companyDetails", CompanyDetailsDto.class),
            Map.entry("signatories", SignatoriesDto.class),
            Map.entry("connectBusinessBank", ConnectBusinessBankDto.class),
            Map.entry("businessFinancials", BusinessFinancialsDto.class),
            Map.entry("businessOutgoings", BusinessOutgoingsDto.class),
            Map.entry("businessCreditDeclarations", BusinessCreditDeclarationsDto.class)
    );

    private final ObjectMapper objectMapper;
    // Deliberately NOT the injected `objectMapper` bean — ApplicationServiceApplication's own
    // @Bean sets FAIL_ON_UNKNOWN_PROPERTIES to false app-wide (for general lenient JSON handling
    // elsewhere), which would have silently defeated this whole class's purpose (rejecting
    // unrecognised fields, S8) had convertValue() below used it directly. .copy() keeps every other
    // setting (JavaTimeModule etc.) and only overrides this one flag.
    private final ObjectMapper strictObjectMapper;
    private final Validator validator;

    public SectionDataValidator(ObjectMapper objectMapper, Validator validator) {
        this.objectMapper = objectMapper;
        this.strictObjectMapper = objectMapper.copy()
                .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true);
        this.validator = validator;
    }

    /**
     * Validates {@code data} against the shape registered for {@code section} and returns it
     * re-serialized from the validated DTO (so what's persisted is exactly the validated,
     * known-fields-only shape) — mirrors the worker's use of Zod's parsed `result.data`.
     *
     * @throws IllegalArgumentException on an unknown section, unrecognised/malformed fields, or a
     *                                  constraint violation — caught by GlobalExceptionHandler and
     *                                  returned as a 400 with the message below.
     */
    public String validateAndSerialize(String section, Map<String, Object> data) {
        Class<?> dtoClass = SECTION_DTO_CLASSES.get(section);
        if (dtoClass == null) {
            throw new IllegalArgumentException("Unknown section: " + section);
        }

        Object dto;
        try {
            dto = strictObjectMapper.convertValue(data, dtoClass);
        } catch (IllegalArgumentException e) {
            String cause = e.getCause() != null ? e.getCause().getMessage() : e.getMessage();
            throw new IllegalArgumentException("Invalid data for section '" + section + "': " + cause);
        }

        Set<ConstraintViolation<Object>> violations = validator.validate(dto);
        if (!violations.isEmpty()) {
            String message = violations.stream()
                    .sorted(Comparator.comparing(v -> v.getPropertyPath().toString()))
                    .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                    .collect(Collectors.joining("; "));
            throw new IllegalArgumentException("Invalid data for section '" + section + "': " + message);
        }

        try {
            return objectMapper.writeValueAsString(dto);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize validated section data", e);
        }
    }
}
