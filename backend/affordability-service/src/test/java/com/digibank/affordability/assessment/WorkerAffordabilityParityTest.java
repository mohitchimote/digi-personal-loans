package com.digibank.affordability.assessment;

import com.digibank.affordability.assessment.dto.AffordabilityRequest;
import com.digibank.affordability.assessment.dto.AffordabilityResult;
import com.digibank.affordability.assessment.dto.BusinessAffordabilityRequest;
import com.digibank.affordability.assessment.dto.BusinessAffordabilityResult;
import com.digibank.affordability.rules.AffordabilityRules;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs the Worker's actual TypeScript calculators (worker/src/lib/affordability-calc.ts) through Node
 * on a few hundred generated applicants and requires the Java services to agree on every field and
 * every message. Skipped when the Worker sources or a Node able to strip TypeScript types are absent.
 */
class WorkerAffordabilityParityTest {

    private static final Path WORKER_CALC = Path.of("..", "..", "worker", "src", "lib", "affordability-calc.ts").toAbsolutePath().normalize();
    private static final Path ORACLE = Path.of("src", "test", "resources", "worker-affordability-oracle.mjs").toAbsolutePath();
    // Java works in BigDecimal, the Worker in doubles (its own header says so): a half-cent boundary can round one cent apart.
    private static final double CENT = 0.0101;
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private static Object pick(Random r, Object... xs) {
        return xs[r.nextInt(xs.length)];
    }

    private static List<Map<String, Object>> personalCases(Random r) {
        List<Map<String, Object>> cases = new ArrayList<>();
        for (int i = 0; i < 300; i++) {
            Map<String, Object> c = new LinkedHashMap<>();
            int gross = 2000 + r.nextInt(40000);
            c.put("monthlyGrossIncome", gross);
            c.put("monthlyNetIncome", (int) (gross * (0.55 + r.nextDouble() * 0.2)));
            c.put("monthlyRent", r.nextInt(5) == 0 ? 0 : r.nextInt(6000));
            c.put("monthlyMortgage", r.nextInt(3) == 0 ? r.nextInt(8000) : 0);
            c.put("monthlyLoans", r.nextInt(3000));
            c.put("creditCardPayments", r.nextInt(1500));
            c.put("otherMonthlyCommitments", r.nextInt(1000));
            c.put("monthlyLivingExpenses", r.nextInt(6000));
            c.put("requestedLoanAmount", 5000 + r.nextInt(300000));
            c.put("requestedTermMonths", 6 + r.nextInt(79));
            Object score = pick(r, 0, 3, 5, 6, 7, 8, 9, 300, 550, 780, 850);
            if (r.nextInt(8) != 0) c.put("creditScore", score);
            if (r.nextInt(20) == 0) c.put("hasDefaulted", true);
            if (r.nextInt(25) == 0) c.put("hasBankruptcy", true);
            cases.add(c);
        }
        return cases;
    }

    private static List<Map<String, Object>> businessCases(Random r) {
        List<Map<String, Object>> cases = new ArrayList<>();
        for (int i = 0; i < 300; i++) {
            Map<String, Object> c = new LinkedHashMap<>();
            int revenue = 20000 + r.nextInt(500000);
            c.put("annualTurnover", revenue * 12);
            c.put("monthlyRevenue", revenue);
            c.put("monthlyOutgoings", (int) (revenue * (0.3 + r.nextDouble() * 0.6)));
            c.put("existingBusinessDebtService", r.nextInt(3) == 0 ? r.nextInt(30000) : 0);
            c.put("requestedLoanAmount", 20000 + r.nextInt(1000000));
            c.put("requestedTermMonths", 6 + r.nextInt(79));
            if (r.nextInt(8) != 0) c.put("directorCreditScore", pick(r, 0, 1, 4, 5, 6, 7, 8, 9, 40, 65, 90, 100));
            if (r.nextInt(20) == 0) c.put("hasCompanyDefaulted", true);
            if (r.nextInt(25) == 0) c.put("hasLiquidationOrWindingUp", true);
            cases.add(c);
        }
        return cases;
    }

    private JsonNode runWorker(Map<String, Object> payload) throws Exception {
        Process p = new ProcessBuilder("node", ORACLE.toString(), WORKER_CALC.toString()).redirectErrorStream(false).start();
        try (var os = p.getOutputStream()) { os.write(MAPPER.writeValueAsBytes(payload)); }
        byte[] out = p.getInputStream().readAllBytes();
        byte[] err = p.getErrorStream().readAllBytes();
        boolean done = p.waitFor(60, TimeUnit.SECONDS);
        Assumptions.assumeTrue(done && p.exitValue() == 0,
                "Node could not run the Worker calculators: " + new String(err, StandardCharsets.UTF_8));
        return MAPPER.readTree(out);
    }

    private static void sameNumber(JsonNode expected, BigDecimal actual, double tolerance, String what) {
        if (expected == null || expected.isNull()) {
            assertThat(actual).as(what).isNull();
        } else {
            assertThat(actual).as(what).isNotNull();
            assertThat(actual.doubleValue()).as(what).isCloseTo(expected.asDouble(), org.assertj.core.data.Offset.offset(tolerance));
        }
    }

    private static void sameText(JsonNode expected, String actual, String what) {
        assertThat(actual).as(what).isEqualTo(expected == null || expected.isNull() ? null : expected.asString());
    }

    private static List<String> texts(JsonNode arr) {
        List<String> out = new ArrayList<>();
        arr.forEach(n -> out.add(n.asString()));
        return out;
    }

    @Test
    void personalAndBusinessAssessmentsAgreeWithTheWorkersCalculators() throws Exception {
        Assumptions.assumeTrue(Files.exists(WORKER_CALC) && Files.exists(ORACLE), "Worker sources not present");
        Random r = new Random(20261111);
        List<Map<String, Object>> personal = personalCases(r);
        List<Map<String, Object>> business = businessCases(r);

        Map<String, Object> rules = new LinkedHashMap<>();
        rules.put("maxDti", 40); rules.put("maxHti", 35); rules.put("minMonthlyIncome", 8000);
        rules.put("baseAnnualRate", 0.06); rules.put("repaymentCapacityFactor", 0.40); rules.put("minCreditScore", 5);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("rules", rules); payload.put("personal", personal); payload.put("business", business);
        JsonNode worker = runWorker(payload);

        AffordabilityRules javaRules = new AffordabilityRules();
        javaRules.setMaxDti(new BigDecimal("40")); javaRules.setMaxHti(new BigDecimal("35"));
        javaRules.setMinMonthlyIncome(new BigDecimal("8000")); javaRules.setBaseAnnualRate(new BigDecimal("0.06"));
        javaRules.setRepaymentCapacityFactor(new BigDecimal("0.40")); javaRules.setMinCreditScore(5);
        AffordabilityService personalService = new AffordabilityService(javaRules);
        BusinessAffordabilityService businessService = new BusinessAffordabilityService();

        int failuresSeen = 0;
        for (int i = 0; i < personal.size(); i++) {
            JsonNode w = worker.get("personal").get(i);
            AffordabilityResult j = personalService.assess(MAPPER.convertValue(personal.get(i), AffordabilityRequest.class));
            String at = "personal #" + i + " " + personal.get(i);
            assertThat(j.isPassed()).as(at + " passed").isEqualTo(w.get("passed").asBoolean());
            assertThat(j.getFailureReasons()).as(at + " reasons").isEqualTo(texts(w.get("failureReasons")));
            sameText(w.get("failureType"), j.getFailureType(), at + " failureType");
            sameNumber(w.get("dti"), j.getDti(), CENT, at + " dti");
            sameNumber(w.get("hti"), j.getHti(), CENT, at + " hti");
            sameNumber(w.get("disposableIncome"), j.getDisposableIncome(), CENT, at + " disposable");
            sameNumber(w.get("monthlyRepaymentCapacity"), j.getMonthlyRepaymentCapacity(), CENT, at + " capacity");
            sameNumber(w.get("calculatedMonthlyRepayment"), j.getCalculatedMonthlyRepayment(), CENT, at + " repayment");
            sameNumber(w.get("maxAffordableAmount"), j.getMaxAffordableAmount(), 0.02, at + " maxAffordable");
            JsonNode wt = w.get("minAffordableTermMonths");
            if (wt.isNull()) assertThat(j.getMinAffordableTermMonths()).as(at + " minTerm").isNull();
            else assertThat(j.getMinAffordableTermMonths()).as(at + " minTerm").isEqualTo(wt.asInt());
            sameText(w.get("riskCategory"), j.getRiskCategory(), at + " risk");
            sameText(w.get("creditScoreCategory"), j.getCreditScoreCategory(), at + " category");
            if (!j.isPassed()) failuresSeen++;
        }
        for (int i = 0; i < business.size(); i++) {
            JsonNode w = worker.get("business").get(i);
            BusinessAffordabilityResult j = businessService.assess(MAPPER.convertValue(business.get(i), BusinessAffordabilityRequest.class));
            String at = "business #" + i + " " + business.get(i);
            assertThat(j.isPassed()).as(at + " passed").isEqualTo(w.get("passed").asBoolean());
            assertThat(j.getFailureReasons()).as(at + " reasons").isEqualTo(texts(w.get("failureReasons")));
            sameText(w.get("failureType"), j.getFailureType(), at + " failureType");
            sameNumber(w.get("dscr"), j.getDscr(), CENT, at + " dscr");
            sameNumber(w.get("monthlyNetOperatingIncome"), j.getMonthlyNetOperatingIncome(), CENT, at + " noi");
            sameNumber(w.get("monthlyRepaymentCapacity"), j.getMonthlyRepaymentCapacity(), CENT, at + " capacity");
            sameNumber(w.get("calculatedMonthlyRepayment"), j.getCalculatedMonthlyRepayment(), CENT, at + " repayment");
            sameNumber(w.get("maxAffordableAmount"), j.getMaxAffordableAmount(), 0.02, at + " maxAffordable");
            JsonNode wt = w.get("minAffordableTermMonths");
            if (wt.isNull()) assertThat(j.getMinAffordableTermMonths()).as(at + " minTerm").isNull();
            else assertThat(j.getMinAffordableTermMonths()).as(at + " minTerm").isEqualTo(wt.asInt());
            sameText(w.get("riskCategory"), j.getRiskCategory(), at + " risk");
            sameText(w.get("creditScoreCategory"), j.getCreditScoreCategory(), at + " category");
            if (!j.isPassed()) failuresSeen++;
        }
        // The generator must exercise the failure paths, otherwise agreement proves little.
        assertThat(failuresSeen).isGreaterThan(100);
    }
}
