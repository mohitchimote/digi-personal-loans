package com.digibank.application.formbuilder;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

import static com.digibank.application.formbuilder.FormSchemaValidatorTest.json;
import static org.assertj.core.api.Assertions.assertThat;

class FormConditionsTest {

    static final JsonNode CONSTANTS = json("[{\"key\":\"retire\",\"label\":\"Retirement\",\"value\":67}]");

    private static boolean visible(String visibility, Map<String, Object> values) {
        JsonNode field = json("{\"key\":\"f\",\"visibility\":" + visibility + "}");
        return FormConditions.isFieldVisible(field, "sec", new FormConditions.Context(CONSTANTS, values));
    }

    private static Map<String, Object> values(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static String cond(String left, String op, String right) {
        return "{\"kind\":\"condition\",\"left\":" + left + ",\"op\":\"" + op + "\",\"right\":" + right + "}";
    }

    static String field(String section, String key) {
        return "{\"kind\":\"field\",\"sectionKey\":\"" + section + "\",\"fieldKey\":\"" + key + "\"}";
    }

    static String lit(String v) {
        return "{\"kind\":\"literal\",\"value\":" + v + "}";
    }

    @Test
    void aFieldWithNoVisibilityIsAlwaysVisible() {
        assertThat(FormConditions.isFieldVisible(json("{\"key\":\"f\"}"), "sec", new FormConditions.Context(null, Map.of()))).isTrue();
        assertThat(visible("null", Map.of())).isTrue();
    }

    @Test
    void aLegacyRuleMeansTheSameSectionAsTheFieldCarryingIt() {
        String rule = "{\"fieldKey\":\"assisted\",\"op\":\"equals\",\"value\":true}";
        assertThat(visible(rule, values("sec.assisted", true))).isTrue();
        assertThat(visible(rule, values("sec.assisted", false))).isFalse();
        assertThat(visible(rule, values("other.assisted", true))).isFalse();
        assertThat(visible(rule, values())).isFalse();
        assertThat(visible("{\"fieldKey\":\"assisted\",\"op\":\"notEquals\",\"value\":true}", values("sec.assisted", false))).isTrue();
    }

    @Test
    void equalsIsStrictAboutTypesButNumbersCompareAsNumbers() {
        assertThat(visible(cond(field("a", "x"), "equals", lit("5")), values("a.x", 5.0))).isTrue();
        assertThat(visible(cond(field("a", "x"), "equals", lit("5")), values("a.x", "5"))).isFalse();
        assertThat(visible(cond(field("a", "x"), "notEquals", lit("\"A\"")), values("a.x", "B"))).isTrue();
    }

    @Test
    void numericComparisonsCoerceToNumbers() {
        Map<String, Object> v = values("a.x", "10");
        assertThat(visible(cond(field("a", "x"), "gt", lit("9")), v)).isTrue();
        assertThat(visible(cond(field("a", "x"), "gte", lit("10")), v)).isTrue();
        assertThat(visible(cond(field("a", "x"), "lt", lit("10")), v)).isFalse();
        assertThat(visible(cond(field("a", "x"), "lte", lit("10")), v)).isTrue();
    }

    @Test
    void containsIsACaseInsensitiveSubstring() {
        assertThat(visible(cond(field("a", "x"), "contains", lit("\"ABC\"")), values("a.x", "xxabcxx"))).isTrue();
        assertThat(visible(cond(field("a", "x"), "contains", lit("\"zzz\"")), values("a.x", "xxabcxx"))).isFalse();
    }

    @Test
    void membershipComparesAsStrings() {
        String in = cond(field("a", "x"), "in", "{\"kind\":\"list\",\"values\":[\"a\",2]}");
        assertThat(visible(in, values("a.x", "a"))).isTrue();
        assertThat(visible(in, values("a.x", 2.0))).isTrue();
        assertThat(visible(in, values("a.x", "z"))).isFalse();
        assertThat(visible(in, values())).isFalse();
        String notIn = cond(field("a", "x"), "notIn", "{\"kind\":\"list\",\"values\":[\"a\"]}");
        assertThat(visible(notIn, values("a.x", "z"))).isTrue();
        assertThat(visible(notIn, values())).isFalse();
    }

    @Test
    void anUnresolvedOperandMakesTheConditionFalseNeverAnError() {
        assertThat(visible(cond(field("a", "missing"), "equals", lit("1")), values())).isFalse();
        assertThat(visible(cond(field("a", "missing"), "notEquals", lit("1")), values())).isFalse();
        assertThat(visible(cond("{\"kind\":\"constant\",\"key\":\"unknown\"}", "gt", lit("1")), values())).isFalse();
    }

    @Test
    void namedConstantsResolve() {
        assertThat(visible(cond(field("a", "age"), "gte", "{\"kind\":\"constant\",\"key\":\"retire\"}"), values("a.age", 70.0))).isTrue();
        assertThat(visible(cond(field("a", "age"), "gte", "{\"kind\":\"constant\",\"key\":\"retire\"}"), values("a.age", 60.0))).isFalse();
    }

    @Test
    void groupsCombineWithAndOr() {
        String t = cond(lit("1"), "equals", lit("1"));
        String f = cond(lit("1"), "equals", lit("2"));
        assertThat(visible("{\"kind\":\"group\",\"op\":\"and\",\"conditions\":[" + t + "," + t + "]}", values())).isTrue();
        assertThat(visible("{\"kind\":\"group\",\"op\":\"and\",\"conditions\":[" + t + "," + f + "]}", values())).isFalse();
        assertThat(visible("{\"kind\":\"group\",\"op\":\"or\",\"conditions\":[" + f + "," + t + "]}", values())).isTrue();
        assertThat(visible("{\"kind\":\"group\",\"op\":\"or\",\"conditions\":[" + f + "," + f + "]}", values())).isFalse();
        String nested = "{\"kind\":\"group\",\"op\":\"and\",\"conditions\":[" + t + ",{\"kind\":\"group\",\"op\":\"or\",\"conditions\":[" + f + "," + t + "]}]}";
        assertThat(visible(nested, values())).isTrue();
    }

    @Test
    void computedAgeFromADateField() {
        String age = "{\"kind\":\"computed\",\"fn\":\"age\",\"dateField\":{\"sectionKey\":\"p\",\"fieldKey\":\"dob\"}}";
        LocalDate dob = LocalDate.now().minusYears(30).minusDays(1);
        assertThat(visible(cond(age, "equals", lit("30")), values("p.dob", dob.toString()))).isTrue();
        // birthday tomorrow: still 29
        LocalDate almost = LocalDate.now().minusYears(30).plusDays(1);
        assertThat(visible(cond(age, "equals", lit("29")), values("p.dob", almost.toString()))).isTrue();
        assertThat(visible(cond(age, "gte", lit("18")), values("p.dob", "not a date"))).isFalse();
        assertThat(visible(cond(age, "gte", lit("18")), values())).isFalse();
    }

    @Test
    void computedAgeCanBeProjectedForwardByAnotherField() {
        String age = "{\"kind\":\"computed\",\"fn\":\"age\",\"dateField\":{\"sectionKey\":\"p\",\"fieldKey\":\"dob\"},"
                + "\"offsetField\":{\"sectionKey\":\"l\",\"fieldKey\":\"term\"},\"offsetUnit\":\"years\"}";
        String dob = LocalDate.now().minusYears(30).minusDays(1).toString();
        // 30 now, so 40 after a ten-year term
        assertThat(visible(cond(age, "equals", lit("40")), values("p.dob", dob, "l.term", 10.0))).isTrue();
        // the offset not answered yet: unresolved, so false
        assertThat(visible(cond(age, "gte", lit("0")), values("p.dob", dob))).isFalse();
        assertThat(visible(cond(age, "gte", lit("0")), values("p.dob", dob, "l.term", ""))).isFalse();
    }
}
