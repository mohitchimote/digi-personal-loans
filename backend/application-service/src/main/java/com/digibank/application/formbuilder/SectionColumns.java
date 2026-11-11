package com.digibank.application.formbuilder;

import com.digibank.application.model.LoanApplication;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.*;
import java.util.function.BiConsumer;
import java.util.function.Function;

/**
 * Section key to JSON column mapping and the schema-aware completion check: the port of
 * worker/src/lib/sections.ts's SECTION_TO_COLUMN, flattenAllSectionValues and needsAttentionSections.
 */
public final class SectionColumns {

    private SectionColumns() {}

    private record Column(Function<LoanApplication, String> get, BiConsumer<LoanApplication, String> set) {}

    private static final Map<String, Column> COLUMNS = new LinkedHashMap<>();

    static {
        COLUMNS.put("loanRequirements", new Column(LoanApplication::getLoanRequirementsJson, LoanApplication::setLoanRequirementsJson));
        COLUMNS.put("consentManagement", new Column(LoanApplication::getConsentManagementJson, LoanApplication::setConsentManagementJson));
        COLUMNS.put("personalDetails", new Column(LoanApplication::getPersonalDetailsJson, LoanApplication::setPersonalDetailsJson));
        COLUMNS.put("connectBank", new Column(LoanApplication::getBankConnectionJson, LoanApplication::setBankConnectionJson));
        COLUMNS.put("incomeEmployment", new Column(LoanApplication::getIncomeEmploymentJson, LoanApplication::setIncomeEmploymentJson));
        COLUMNS.put("outgoings", new Column(LoanApplication::getOutgoingsJson, LoanApplication::setOutgoingsJson));
        COLUMNS.put("creditDeclarations", new Column(LoanApplication::getCreditDeclarationsJson, LoanApplication::setCreditDeclarationsJson));
        COLUMNS.put("verifyId", new Column(LoanApplication::getVerifyIdJson, LoanApplication::setVerifyIdJson));
        COLUMNS.put("directDebit", new Column(LoanApplication::getDirectDebitJson, LoanApplication::setDirectDebitJson));
        COLUMNS.put("reviewSubmit", new Column(LoanApplication::getReviewSubmitJson, LoanApplication::setReviewSubmitJson));
        COLUMNS.put("guarantorDetails", new Column(LoanApplication::getGuarantorDetailsJson, LoanApplication::setGuarantorDetailsJson));
        COLUMNS.put("companyDetails", new Column(LoanApplication::getCompanyDetailsJson, LoanApplication::setCompanyDetailsJson));
        COLUMNS.put("signatories", new Column(LoanApplication::getSignatoriesJson, LoanApplication::setSignatoriesJson));
        COLUMNS.put("connectBusinessBank", new Column(LoanApplication::getBusinessBankConnectionJson, LoanApplication::setBusinessBankConnectionJson));
        COLUMNS.put("businessFinancials", new Column(LoanApplication::getBusinessFinancialsJson, LoanApplication::setBusinessFinancialsJson));
        COLUMNS.put("businessOutgoings", new Column(LoanApplication::getBusinessOutgoingsJson, LoanApplication::setBusinessOutgoingsJson));
        COLUMNS.put("businessCreditDeclarations", new Column(LoanApplication::getBusinessCreditDeclarationsJson, LoanApplication::setBusinessCreditDeclarationsJson));
    }

    public static boolean isKnown(String section) {
        return COLUMNS.containsKey(section);
    }

    public static String read(LoanApplication app, String section) {
        Column c = COLUMNS.get(section);
        return c == null ? null : c.get().apply(app);
    }

    /** @return false for an unknown section */
    public static boolean write(LoanApplication app, String section, String json) {
        Column c = COLUMNS.get(section);
        if (c == null) return false;
        c.set().accept(app, json);
        return true;
    }

    /** Every saved section's JSON flattened into one map keyed "sectionKey.fieldKey". */
    public static Map<String, Object> flattenAllSectionValues(LoanApplication app, ObjectMapper mapper) {
        Map<String, Object> values = new HashMap<>();
        for (Map.Entry<String, Column> e : COLUMNS.entrySet()) {
            String raw = e.getValue().get().apply(app);
            if (raw == null) continue;
            try {
                JsonNode data = mapper.readTree(raw);
                if (!data.isObject()) continue;
                data.fields().forEachRemaining(f -> values.put(e.getKey() + "." + f.getKey(), plain(mapper, f.getValue())));
            } catch (Exception ignored) {
                // a section that does not parse contributes nothing
            }
        }
        return values;
    }

    public static Object plain(ObjectMapper mapper, JsonNode v) {
        if (v == null || v.isNull()) return null;
        if (v.isBoolean()) return v.asBoolean();
        if (v.isNumber()) return v.numberValue().doubleValue();
        if (v.isTextual()) return v.asText();
        return mapper.convertValue(v, Object.class);
    }

    /**
     * Sections the legacy per-column check calls filled but that now lack a required, visible field of
     * the form version in force (an admin added or tightened one after the customer finished). It only
     * ever adds sections to the incomplete set.
     */
    public static List<String> needsAttentionSections(LoanApplication app, JsonNode schema, ObjectMapper mapper,
                                                      java.util.function.BiPredicate<LoanApplication, String> isFilled) {
        List<String> flagged = new ArrayList<>();
        if (schema == null) return flagged;
        Map<String, Object> values = flattenAllSectionValues(app, mapper);
        FormConditions.Context ctx = new FormConditions.Context(schema.get("constants"), values);
        for (JsonNode section : schema.path("sections")) {
            String key = section.path("key").asText();
            if (!isFilled.test(app, key)) continue;
            if (read(app, key) == null) continue;
            for (JsonNode f : section.path("fields")) {
                if (!f.path("required").asBoolean(false) || f.path("hidden").asBoolean(false)
                        || !FormConditions.isFieldVisible(f, key, ctx)) continue;
                Object value = values.get(key + "." + f.path("key").asText());
                if (value == null || "".equals(value)) {
                    flagged.add(key);
                    break;
                }
            }
        }
        return flagged;
    }
}
