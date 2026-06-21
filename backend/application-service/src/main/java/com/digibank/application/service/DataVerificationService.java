package com.digibank.application.service;

import com.digibank.application.dto.DataVerificationResolution;
import com.digibank.application.dto.DataVerificationResolutionRequest;
import com.digibank.application.dto.DataVerificationRule;
import com.digibank.application.dto.DataVerificationSummary;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.repository.LoanApplicationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Generates a demo-only, deterministic-per-application "discrepancy check" comparing the
 * customer's self-declared Application Data against synthetic Document Data (no OCR exists —
 * uploaded files are never read) and synthetic 3rd-Party Data (no credit-bureau/national-registry
 * integration exists). Same applicationRef always produces the same result (seeded by the ref);
 * different applications produce different but plausible discrepancies, so the demo works with
 * whatever name/income the underwriter actually typed in rather than a hardcoded persona.
 */
@Service
public class DataVerificationService {

    private final LoanApplicationRepository repository;
    private final ObjectMapper objectMapper;

    private static final List<String> SURNAME_POOL = List.of(
            "Cohen", "Levi", "Mizrahi", "Peretz", "Biton", "Avraham", "Friedman", "Katz");
    private static final List<String> CITY_POOL = List.of(
            "Tel Aviv", "Haifa", "Jerusalem", "Beer Sheva", "Netanya", "Rishon LeZion");
    private static final List<String> EMPLOYER_POOL = List.of(
            "Teva Pharmaceutical Industries", "Bank Hapoalim", "Check Point Software",
            "Elbit Systems", "Wix.com", "Amdocs");

    public DataVerificationService(LoanApplicationRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public DataVerificationSummary getOrGenerate(String appRef) {
        LoanApplication app = getByRef(appRef);
        if (app.getDataVerificationJson() != null) {
            return deserialize(app.getDataVerificationJson());
        }
        DataVerificationSummary summary = generate(app);
        persist(app, summary);
        return summary;
    }

    @Transactional
    public DataVerificationSummary resolveRule(String appRef, DataVerificationResolutionRequest request) {
        LoanApplication app = getByRef(appRef);
        DataVerificationSummary summary = app.getDataVerificationJson() != null
                ? deserialize(app.getDataVerificationJson())
                : generate(app);

        if ("APPROVE_EXCEPTION".equals(request.getAction()) && isBlank(request.getNote())) {
            throw new IllegalArgumentException("A note is required to approve as an exception.");
        }

        DataVerificationRule rule = summary.getRules().stream()
                .filter(r -> r.getRuleKey().equals(request.getRuleKey()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown data verification rule: " + request.getRuleKey()));

        DataVerificationResolution resolution = new DataVerificationResolution();
        resolution.setAction(request.getAction());
        resolution.setNote(request.getNote());
        resolution.setReviewedBy(request.getReviewedBy());
        resolution.setResolvedAt(LocalDateTime.now().toString());
        rule.setResolution(resolution);

        persist(app, summary);
        return summary;
    }

    private DataVerificationSummary generate(LoanApplication app) {
        JsonNode personal = readTree(app.getPersonalDetailsJson());
        JsonNode income = readTree(app.getIncomeEmploymentJson());
        JsonNode credit = readTree(app.getCreditDeclarationsJson());

        long seed = app.getApplicationRef().hashCode();

        List<DataVerificationRule> rules = new ArrayList<>();
        rules.add(buildFullNameRule(personal, seed));
        rules.add(buildDateOfBirthRule(personal, seed));
        rules.add(buildNationalIdRule(personal, seed));
        rules.add(buildAddressRule(personal, seed));
        rules.add(buildIncomeRule(income, seed));
        rules.add(buildEmployerRule(income, seed));
        rules.add(buildCreditScoreRule(credit, seed));
        rules.add(buildBooleanFlagRule(credit, seed, "hasDefaulted"));
        rules.add(buildBooleanFlagRule(credit, seed, "hasBankruptcy"));
        rules.add(buildBooleanFlagRule(credit, seed, "hasCCJ"));

        DataVerificationSummary summary = new DataVerificationSummary();
        summary.setGeneratedAt(LocalDateTime.now().toString());
        summary.setSeed(app.getApplicationRef());
        summary.setRules(rules);
        return summary;
    }

    // ---- per-rule generators -------------------------------------------------------------

    private DataVerificationRule buildFullNameRule(JsonNode personal, long seed) {
        String first = personal.path("firstName").asText("");
        String last = personal.path("lastName").asText("");
        String appValue = (first + " " + last).trim();

        Random rng = ruleRandom(seed, "fullName");
        String status = bucket(rng.nextInt(100));
        String docValue = appValue;
        String thirdPartyValue = appValue;
        switch (status) {
            case "AMBER" -> docValue = swapAdjacentChars(appValue, rng);
            case "RED" -> docValue = (first + " " + pick(SURNAME_POOL, rng, last)).trim();
            default -> { }
        }
        return rule("fullName", "personalDetails", appValue, docValue, thirdPartyValue, status);
    }

    private DataVerificationRule buildDateOfBirthRule(JsonNode personal, long seed) {
        String appValue = personal.path("dateOfBirth").asText("");
        Random rng = ruleRandom(seed, "dateOfBirth");
        String status = bucket(rng.nextInt(100));
        String docValue = appValue;
        String thirdPartyValue = appValue;
        LocalDate parsed = parseDate(appValue);
        if (parsed != null) {
            switch (status) {
                case "AMBER" -> docValue = parsed.plusDays(rng.nextBoolean() ? 1 : -1).toString();
                case "RED" -> {
                    docValue = parsed.plusMonths(1 + rng.nextInt(3)).toString();
                    thirdPartyValue = docValue;
                }
                default -> { }
            }
        }
        return rule("dateOfBirth", "personalDetails", appValue, docValue, thirdPartyValue, status);
    }

    private DataVerificationRule buildNationalIdRule(JsonNode personal, long seed) {
        String appValue = personal.path("nationalId").asText("");
        Random rng = ruleRandom(seed, "nationalId");
        String status = bucket(rng.nextInt(100));
        String docValue = appValue;
        String thirdPartyValue = appValue;
        if (appValue.length() >= 2) {
            switch (status) {
                case "AMBER" -> docValue = swapAdjacentChars(appValue, rng);
                case "RED" -> docValue = mutateLastDigits(appValue, rng);
                default -> { }
            }
        }
        return rule("nationalId", "personalDetails", appValue, docValue, thirdPartyValue, status);
    }

    private DataVerificationRule buildAddressRule(JsonNode personal, long seed) {
        String street = personal.path("street").asText("");
        String city = personal.path("city").asText("");
        String appValue = (street + ", " + city).trim();
        Random rng = ruleRandom(seed, "address");
        String status = bucket(rng.nextInt(100));
        String docValue = appValue;
        String thirdPartyValue = appValue;
        switch (status) {
            case "AMBER" -> docValue = abbreviateStreet(street) + ", " + city;
            case "RED" -> {
                docValue = street + ", " + pick(CITY_POOL, rng, city);
                thirdPartyValue = docValue;
            }
            default -> { }
        }
        return rule("address", "personalDetails", appValue, docValue, thirdPartyValue, status);
    }

    private DataVerificationRule buildIncomeRule(JsonNode income, long seed) {
        double gross = income.path("monthlyGrossIncome").asDouble(0);
        String appValue = formatCurrency(gross);
        Random rng = ruleRandom(seed, "monthlyIncome");
        String status = bucket(rng.nextInt(100));
        double docAmount = gross;
        switch (status) {
            case "AMBER" -> docAmount = gross * 0.90;
            case "RED" -> docAmount = gross * 0.70;
            default -> { }
        }
        String docValue = gross > 0 ? formatCurrency(docAmount) : "";
        String thirdPartyValue = gross > 0 ? incomeBand(docAmount) : "";
        return rule("monthlyIncome", "incomeEmployment", appValue, docValue, thirdPartyValue, status);
    }

    private DataVerificationRule buildEmployerRule(JsonNode income, long seed) {
        String appValue = income.path("employer").asText("");
        Random rng = ruleRandom(seed, "employer");
        String status = bucket(rng.nextInt(100));
        String docValue = appValue;
        switch (status) {
            case "AMBER" -> docValue = appValue.isBlank() ? appValue : appValue + " Ltd";
            case "RED" -> docValue = pick(EMPLOYER_POOL, rng, appValue);
            default -> { }
        }
        return rule("employer", "incomeEmployment", appValue, docValue, "—", status);
    }

    private DataVerificationRule buildCreditScoreRule(JsonNode credit, long seed) {
        int declared = credit.path("creditScore").asInt(0);
        String appValue = declared > 0 ? String.valueOf(declared) : "";
        Random rng = ruleRandom(seed, "creditScore");
        String status = bucket(rng.nextInt(100));
        int bureauScore = bureauScoreFromDeclared(declared);
        switch (status) {
            case "AMBER" -> bureauScore -= 40;
            case "RED" -> bureauScore -= 120;
            default -> { }
        }
        bureauScore = Math.max(300, Math.min(850, bureauScore));
        String thirdPartyValue = declared > 0 ? bureauScore + " (bureau)" : "";
        return rule("creditScore", "creditDeclarations", appValue, "—", thirdPartyValue, status);
    }

    private DataVerificationRule buildBooleanFlagRule(JsonNode credit, long seed, String field) {
        boolean declared = credit.path(field).asBoolean(false);
        String appValue = declared ? "Yes" : "No";
        Random rng = ruleRandom(seed, field);
        String status = bucket(rng.nextInt(100));
        boolean bureauValue = declared;
        if ("RED".equals(status)) {
            bureauValue = !declared;
        }
        String thirdPartyValue = bureauValue ? "Yes" : "No";
        return rule(field, "creditDeclarations", appValue, "—", thirdPartyValue, status);
    }

    // ---- helpers ---------------------------------------------------------------------------

    private DataVerificationRule rule(String key, String section, String appValue, String docValue,
                                       String thirdPartyValue, String status) {
        DataVerificationRule rule = new DataVerificationRule();
        rule.setRuleKey(key);
        rule.setSection(section);
        rule.setApplicationValue(appValue);
        rule.setDocumentValue(docValue);
        rule.setThirdPartyValue(thirdPartyValue);
        rule.setStatus(status);
        return rule;
    }

    private Random ruleRandom(long seed, String ruleKey) {
        return new Random(seed + ruleKey.hashCode());
    }

    private String bucket(int roll) {
        if (roll < 60) return "GREEN";
        if (roll < 85) return "AMBER";
        return "RED";
    }

    private String swapAdjacentChars(String value, Random rng) {
        if (value == null || value.trim().length() < 2) return value;
        char[] chars = value.toCharArray();
        int i = rng.nextInt(chars.length - 1);
        if (chars[i] == ' ' ) i = Math.max(0, i - 1);
        if (i + 1 >= chars.length || chars[i] == ' ' || chars[i + 1] == ' ') return value;
        char tmp = chars[i];
        chars[i] = chars[i + 1];
        chars[i + 1] = tmp;
        return new String(chars);
    }

    private String mutateLastDigits(String value, Random rng) {
        if (value.length() < 2) return value;
        char[] chars = value.toCharArray();
        int idx = chars.length - 1;
        int digit = Character.isDigit(chars[idx]) ? Character.getNumericValue(chars[idx]) : 0;
        int mutated = (digit + 1 + rng.nextInt(8)) % 10;
        chars[idx] = Character.forDigit(mutated, 10);
        return new String(chars);
    }

    private String abbreviateStreet(String street) {
        if (street == null) return street;
        return street.replace("Street", "St.").replace("Boulevard", "Blvd.").replace("Avenue", "Ave.");
    }

    private String pick(List<String> pool, Random rng, String exclude) {
        List<String> candidates = pool.stream().filter(v -> !v.equalsIgnoreCase(exclude)).toList();
        if (candidates.isEmpty()) return pool.get(0);
        return candidates.get(rng.nextInt(candidates.size()));
    }

    private String formatCurrency(double amount) {
        return String.format("₪%,.0f", amount);
    }

    private String incomeBand(double aroundAmount) {
        double low = Math.max(0, aroundAmount - 2500);
        double high = aroundAmount + 2500;
        return formatCurrency(low) + " – " + formatCurrency(high) + " (est.)";
    }

    /** Maps the customer's self-declared 1-9 score onto a plausible 300-850 bureau-style score. */
    private int bureauScoreFromDeclared(int declared) {
        if (declared <= 0) return 650;
        return 300 + (declared * 550 / 9);
    }

    private LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private JsonNode readTree(String json) {
        if (json == null) return objectMapper.createObjectNode();
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException e) {
            return objectMapper.createObjectNode();
        }
    }

    private DataVerificationSummary deserialize(String json) {
        try {
            return objectMapper.readValue(json, DataVerificationSummary.class);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize data verification summary", e);
        }
    }

    private void persist(LoanApplication app, DataVerificationSummary summary) {
        try {
            app.setDataVerificationJson(objectMapper.writeValueAsString(summary));
            repository.save(app);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize data verification summary", e);
        }
    }

    private LoanApplication getByRef(String appRef) {
        return repository.findByApplicationRef(appRef)
                .orElseThrow(() -> new IllegalArgumentException("Application not found: " + appRef));
    }
}
