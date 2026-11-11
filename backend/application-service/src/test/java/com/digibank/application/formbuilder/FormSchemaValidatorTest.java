package com.digibank.application.formbuilder;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FormSchemaValidatorTest {

    static final ObjectMapper MAPPER = new ObjectMapper();
    final FormSchemaValidator validator = new FormSchemaValidator();

    static JsonNode json(String s) {
        try {
            return MAPPER.readTree(s);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** One section with one existing field; extra is spliced into the field object. */
    static String withField(String extra) {
        return "{\"sections\":[{\"key\":\"outgoings\",\"order\":1,\"sideMenuLabelKey\":\"steps.outgoings\","
                + "\"sectionHeaders\":[{\"key\":\"h\",\"labelKey\":\"k\",\"order\":1}],"
                + "\"fields\":[{\"key\":\"monthlyRent\",\"sectionHeaderKey\":\"h\",\"kind\":\"existing\",\"labelKey\":\"k\","
                + "\"required\":true,\"order\":1" + extra + "}]}]}";
    }

    private List<String> issues(String schema) {
        return validator.validate(json(schema));
    }

    @Test
    void theSeededSchemasOfBothFormsAreValid() {
        for (String formKey : FormSchemaValidator.FORM_KEYS) {
            assertThat(validator.validate(json(FormVersionService.defaultSchemaJson(formKey)))).as(formKey).isEmpty();
        }
    }

    @Test
    void aMinimalSchemaAndAnEmptyOneAreValid() {
        assertThat(issues("{\"sections\":[]}")).isEmpty();
        assertThat(issues(withField(""))).isEmpty();
    }

    @Test
    void unknownKeysAreRejectedAtEveryLevel() {
        assertThat(issues("{\"sections\":[],\"extra\":1}")).anyMatch(i -> i.contains("unrecognized key 'extra'"));
        assertThat(issues(withField(",\"surprise\":true"))).anyMatch(i -> i.contains("unrecognized key 'surprise'"));
        assertThat(issues(withField(",\"validation\":{\"min\":1,\"bogus\":2}"))).anyMatch(i -> i.contains("bogus"));
        assertThat(issues(withField(",\"label\":{\"en\":\"a\",\"he\":\"b\",\"fr\":\"c\"}"))).anyMatch(i -> i.contains("'fr'"));
        assertThat(issues(withField(",\"options\":[{\"value\":\"a\",\"label\":{\"en\":\"a\",\"he\":\"b\"},\"x\":1}]")))
                .anyMatch(i -> i.contains("'x'"));
    }

    @Test
    void shapeAndTypeErrorsAreReported() {
        assertThat(validator.validate(json("[]"))).isNotEmpty();
        assertThat(issues("{}")).anyMatch(i -> i.contains("sections"));
        assertThat(issues(withField("").replace("\"order\":1}]}]}", "\"order\":\"1\"}]}]}"))).anyMatch(i -> i.contains("order: expected a number"));
        assertThat(issues(withField("").replace("\"required\":true", "\"required\":\"yes\""))).anyMatch(i -> i.contains("required"));
        assertThat(issues(withField("").replace("existing", "other"))).anyMatch(i -> i.contains("kind"));
        assertThat(issues(withField(",\"type\":\"slider\""))).anyMatch(i -> i.contains("type"));
    }

    @Test
    void aCustomFieldMustDeclareAType() {
        assertThat(issues(withField("").replace("existing", "custom"))).anyMatch(i -> i.contains("custom fields must declare a type"));
        assertThat(issues(withField(",\"type\":\"text\"").replace("existing", "custom"))).isEmpty();
    }

    @Test
    void aFieldAndAHeaderNeedALabel() {
        assertThat(issues(withField("").replace("\"labelKey\":\"k\",\"required\"", "\"required\""))).anyMatch(i -> i.contains("needs either labelKey"));
        assertThat(issues(withField("").replace("\"labelKey\":\"k\",\"required\"", "\"label\":{\"en\":\"a\",\"he\":\"b\"},\"required\""))).isEmpty();
        assertThat(issues(withField("").replace("{\"key\":\"h\",\"labelKey\":\"k\",\"order\":1}", "{\"key\":\"h\",\"order\":1}")))
                .anyMatch(i -> i.contains("section header needs either labelKey"));
    }

    @Test
    void optionCodesMustBeUniqueAndNotEmpty() {
        String dup = ",\"options\":[{\"value\":\"a\",\"label\":{\"en\":\"A\",\"he\":\"A\"}},{\"value\":\"a\",\"label\":{\"en\":\"B\",\"he\":\"B\"}}]";
        assertThat(issues(withField(dup))).anyMatch(i -> i.contains("duplicate option value 'a'"));
        String empty = ",\"options\":[{\"value\":\"\",\"label\":{\"en\":\"A\",\"he\":\"A\"}}]";
        assertThat(issues(withField(empty))).anyMatch(i -> i.contains("must not be empty"));
    }

    @Test
    void optionsDependOnMustPointAtAnEarlierFieldOfTheSameSection() {
        String twoFields = "{\"sections\":[{\"key\":\"outgoings\",\"order\":1,\"sideMenuLabelKey\":\"s\","
                + "\"sectionHeaders\":[{\"key\":\"h\",\"labelKey\":\"k\",\"order\":1}],\"fields\":["
                + "{\"key\":\"a\",\"sectionHeaderKey\":\"h\",\"kind\":\"existing\",\"labelKey\":\"k\",\"required\":true,\"order\":1%s},"
                + "{\"key\":\"b\",\"sectionHeaderKey\":\"h\",\"kind\":\"existing\",\"labelKey\":\"k\",\"required\":true,\"order\":2%s}]}]}";
        String dep = ",\"optionsDependOn\":{\"fieldKey\":\"%s\",\"map\":{\"x\":[\"y\"]}}";
        assertThat(issues(String.format(twoFields, "", String.format(dep, "a")))).isEmpty();
        assertThat(issues(String.format(twoFields, "", String.format(dep, "zzz")))).anyMatch(i -> i.contains("unknown field 'zzz'"));
        assertThat(issues(String.format(twoFields, String.format(dep, "b"), ""))).anyMatch(i -> i.contains("must come before it"));
        assertThat(issues(String.format(twoFields, "", ",\"optionsDependOn\":{\"fieldKey\":\"a\",\"map\":{\"x\":\"y\"}}")))
                .anyMatch(i -> i.contains("array of strings"));
    }

    @Test
    void visibilityAcceptsTheLegacyRuleAConditionAndAGroup() {
        assertThat(issues(withField(",\"visibility\":{\"fieldKey\":\"x\",\"op\":\"equals\",\"value\":true}"))).isEmpty();
        assertThat(issues(withField(",\"visibility\":null"))).isEmpty();
        String cond = "{\"kind\":\"condition\",\"left\":{\"kind\":\"field\",\"sectionKey\":\"s\",\"fieldKey\":\"f\"},\"op\":\"gte\",\"right\":{\"kind\":\"literal\",\"value\":18}}";
        assertThat(issues(withField(",\"visibility\":" + cond))).isEmpty();
        assertThat(issues(withField(",\"visibility\":{\"kind\":\"group\",\"op\":\"or\",\"conditions\":[" + cond + "," + cond + "]}"))).isEmpty();
        String member = "{\"kind\":\"condition\",\"left\":{\"kind\":\"constant\",\"key\":\"c\"},\"op\":\"in\",\"right\":{\"kind\":\"list\",\"values\":[\"a\",1]}}";
        assertThat(issues(withField(",\"visibility\":" + member))).isEmpty();
        String computed = "{\"kind\":\"condition\",\"left\":{\"kind\":\"computed\",\"fn\":\"age\",\"dateField\":{\"sectionKey\":\"p\",\"fieldKey\":\"dob\"},"
                + "\"offsetField\":{\"sectionKey\":\"l\",\"fieldKey\":\"term\"},\"offsetUnit\":\"months\"},\"op\":\"lt\",\"right\":{\"kind\":\"literal\",\"value\":70}}";
        assertThat(issues(withField(",\"visibility\":" + computed))).isEmpty();
    }

    @Test
    void malformedVisibilityIsRejected() {
        assertThat(issues(withField(",\"visibility\":{\"fieldKey\":\"x\",\"op\":\"gt\",\"value\":1}"))).anyMatch(i -> i.contains("op"));
        assertThat(issues(withField(",\"visibility\":{\"kind\":\"group\",\"op\":\"and\",\"conditions\":[]}"))).anyMatch(i -> i.contains("non-empty"));
        assertThat(issues(withField(",\"visibility\":{\"kind\":\"condition\",\"left\":{\"kind\":\"literal\",\"value\":1},\"op\":\"in\",\"right\":{\"kind\":\"literal\",\"value\":1}}")))
                .anyMatch(i -> i.contains("list operand"));
        assertThat(issues(withField(",\"visibility\":{\"kind\":\"condition\",\"left\":{\"kind\":\"computed\",\"fn\":\"sqrt\",\"dateField\":{\"sectionKey\":\"p\",\"fieldKey\":\"d\"}},\"op\":\"gt\",\"right\":{\"kind\":\"literal\",\"value\":1}}")))
                .anyMatch(i -> i.contains("fn"));
        assertThat(issues(withField(",\"visibility\":{\"kind\":\"nope\"}"))).anyMatch(i -> i.contains("kind"));
    }

    @Test
    void namedConstantsAreChecked() {
        assertThat(issues("{\"sections\":[],\"constants\":[{\"key\":\"retire\",\"label\":\"Retirement age\",\"value\":67}]}")).isEmpty();
        assertThat(issues("{\"sections\":[],\"constants\":[{\"key\":\"retire\",\"label\":\"x\",\"value\":\"67\"}]}")).isNotEmpty();
    }

    @Test
    void assertValidThrowsAReadableMessage() {
        assertThatThrownBy(() -> validator.assertValid(json("{\"sections\":[],\"extra\":1}")))
                .isInstanceOf(IllegalArgumentException.class).hasMessageStartingWith("Invalid form schema: ").hasMessageContaining("extra");
        validator.assertValid(json("{\"sections\":[]}"));
    }
}
