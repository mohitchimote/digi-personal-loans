package com.digibank.notification.service;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationTemplatesTest {

    private static final Path WORKER = Path.of("..", "..", "worker", "src");
    private static final Path JAVA_SOURCE = Path.of("src", "main", "java", "com", "digibank", "notification", "service", "NotificationTemplates.java");

    // ---- behaviour ----------------------------------------------------------------------------

    @Test
    void greetingFollowsTheLanguageAndFallsBackLikeTheWorker() {
        assertThat(NotificationTemplates.greeting("Dana", "en")).isEqualTo("Dear Dana,");
        assertThat(NotificationTemplates.greeting("Dana", "he")).isEqualTo("שלום Dana,");
        assertThat(NotificationTemplates.greeting(null, "en")).isEqualTo("Dear Customer,");
        assertThat(NotificationTemplates.greeting("  ", "he")).isEqualTo("שלום רבים,");
    }

    @Test
    void anyLanguageOtherThanHebrewIsEnglish() {
        assertThat(NotificationTemplates.normaliseLang("fr")).isEqualTo("en");
        assertThat(NotificationTemplates.normaliseLang(null)).isEqualTo("en");
        assertThat(NotificationTemplates.normaliseLang("he")).isEqualTo("he");
    }

    @Test
    void loanPurposeIsTranslatedWhenKnownAndPassedThroughWhenNot() {
        assertThat(NotificationTemplates.loanPurpose("Home Improvement", "he")).isEqualTo("שיפוץ דירה");
        assertThat(NotificationTemplates.loanPurpose("Home Improvement", "en")).isEqualTo("Home Improvement");
        assertThat(NotificationTemplates.loanPurpose("A boat", "he")).isEqualTo("A boat");
        assertThat(NotificationTemplates.loanPurpose(null, "en")).isEqualTo("your requested purpose");
        assertThat(NotificationTemplates.loanPurpose("", "he")).isEqualTo("המטרה שביקשת");
    }

    @Test
    void welcomeIsThreeNotificationsInTheRequestedLanguage() {
        var en = NotificationTemplates.welcome("en");
        var he = NotificationTemplates.welcome("he");
        assertThat(en).hasSize(3);
        assertThat(he).hasSize(3);
        assertThat(en.get(0).title()).isEqualTo("Welcome to DigiBank Personal Loans");
        assertThat(he.get(0).title()).isEqualTo("ברוכים הבאים להלוואות פרטיות מדיגילנד");
        assertThat(en).extracting(NotificationTemplates.Spec::type).containsExactly("SUCCESS", "INFO", "INFO");
        assertThat(he).extracting(NotificationTemplates.Spec::type).containsExactly("SUCCESS", "INFO", "INFO");
    }

    @Test
    void declineIsWrittenInHebrewForAHebrewCustomer() {
        var spec = NotificationTemplates.buildNotification("DECISION_DECLINED", "Dana", "Wedding", "he", Map.of("reason", "Too low"));
        assertThat(spec.title()).isEqualTo("עדכון לגבי בקשת ההלוואה שלך");
        assertThat(spec.type()).isEqualTo("APPLICATION_UPDATE");
        assertThat(spec.message()).startsWith("שלום Dana, תודה שהגשת בקשה להלוואה פרטית עבור חתונה בדיגילנד. ")
                .contains("סיבה: Too low");
    }

    @Test
    void declineIsWrittenInEnglishOtherwise() {
        var spec = NotificationTemplates.buildNotification("DECISION_DECLINED", "Dana", "Wedding", "en", Map.of("reason", "Too low"));
        assertThat(spec.title()).isEqualTo("Update on Your Loan Application");
        assertThat(spec.message()).startsWith("Dear Dana, Thank you for applying for a personal loan for Wedding with DigiBank. ")
                .contains("Reason: Too low");
    }

    @Test
    void sendBackAppendsTheGuarantorNoteOnlyWhenAGuarantorIsNewlyNeeded() {
        Map<String, Object> needed = Map.of("reason", "r", "requireGuarantor", true, "guarantorDetailsPresent", false);
        Map<String, Object> alreadyOnFile = Map.of("reason", "r", "requireGuarantor", true, "guarantorDetailsPresent", true);
        assertThat(NotificationTemplates.buildNotification("SEND_BACK", "D", null, "en", needed).message())
                .endsWith("before resubmitting.");
        assertThat(NotificationTemplates.buildNotification("SEND_BACK", "D", null, "he", needed).message())
                .endsWith("לפני ההגשה מחדש.");
        assertThat(NotificationTemplates.buildNotification("SEND_BACK", "D", null, "en", alreadyOnFile).message())
                .endsWith("resubmit for review.");
    }

    @Test
    void documentAndClarificationRequestsUseTheLocalisedSectionName() {
        Map<String, Object> vars = Map.of("text", "Please upload", "section", "incomeEmployment");
        var doc = NotificationTemplates.buildNotification("DOCUMENT_REQUEST", "D", null, "he", vars);
        assertThat(doc.title()).isEqualTo("נדרש מסמך עבור בקשת ההלוואה שלך");
        assertThat(doc.message()).contains("פרטי הכנסה ותעסוקה שלך וזקוק למסמך נוסף");
        var clar = NotificationTemplates.buildNotification("CLARIFICATION_REQUEST", "D", null, "en", vars);
        assertThat(clar.message()).contains("reviewing your Income & Employment details and needs some clarification");
    }

    @Test
    void anUnknownTemplateProducesNothing() {
        assertThat(NotificationTemplates.buildNotification("NOPE", "D", null, "en", Map.of())).isNull();
    }

    @Test
    void emailVariablesFollowTheWorkersPerEventShape() {
        assertThat(NotificationTemplates.buildEmailVars("DECISION_APPROVED", Map.of("approvedAmount", 45000, "reviewedBy", "Alex"), "en"))
                .containsEntry("approvedAmount", "45000").containsEntry("reviewedBy", "Alex");
        assertThat(NotificationTemplates.buildEmailVars("DOCUMENT_REQUEST", Map.of("underwriterNote", "n", "section", "verifyId"), "he"))
                .containsEntry("sectionName", "ID Verification").containsEntry("underwriterNote", "n");
        assertThat(NotificationTemplates.buildEmailVars("SEND_BACK", Map.of("requireGuarantor", true), "he").get("guarantorRequiredNote"))
                .startsWith(" כעת נדרש ערב");
    }

    // ---- parity with the Worker's source ----------------------------------------------------------

    private static String read(Path p) throws IOException {
        return Files.readString(p, StandardCharsets.UTF_8);
    }

    private static String stripComments(String ts) {
        String noBlock = ts.replaceAll("(?s)/\\*.*?\\*/", "");
        StringBuilder sb = new StringBuilder();
        for (String line : noBlock.split("\n")) {
            if (!line.trim().startsWith("//")) sb.append(line).append('\n');
        }
        return sb.toString();
    }

    private static final Pattern LITERAL = Pattern.compile("\"((?:[^\"\\\\]|\\\\.)*)\"|`((?:[^`\\\\]|\\\\.)*)`");
    private static final Pattern HEBREW = Pattern.compile("[\\u0590-\\u05FF]");

    private static String norm(String s) {
        return s.replaceAll("\\s+", " ");
    }

    /** Every string-literal fragment (template placeholders cut out) of the TypeScript text. */
    private static List<String> fragments(String ts) {
        List<String> out = new ArrayList<>();
        Matcher m = LITERAL.matcher(stripComments(ts));
        while (m.find()) {
            String lit = m.group(1) != null ? m.group(1) : m.group(2);
            for (String part : lit.split("\\$\\{[^}]*\\}")) {
                String p = norm(part).trim();
                if (!p.isEmpty()) out.add(p);
            }
        }
        return out;
    }

    private static String javaLiteralBlob() throws IOException {
        StringBuilder sb = new StringBuilder();
        Matcher m = LITERAL.matcher(read(JAVA_SOURCE));
        while (m.find()) if (m.group(1) != null) sb.append(m.group(1));
        return norm(sb.toString());
    }

    private static void assertAllPresent(List<String> frags, int minLen, String label) throws IOException {
        String blob = javaLiteralBlob();
        List<String> missing = new ArrayList<>();
        for (String f : frags) {
            if (f.startsWith(".")) continue; // import paths
            boolean hebrew = HEBREW.matcher(f).find();
            if (!hebrew && f.length() < minLen) continue;
            if (!blob.contains(f)) missing.add(f);
        }
        assertThat(missing).as(label + ": Worker text with no Java counterpart").isEmpty();
    }

    @Test
    void everyNotificationStringInTheWorkersMessagesFileExistsHere() throws IOException {
        Path p = WORKER.resolve(Path.of("lib", "workflow", "messages.ts"));
        Assumptions.assumeTrue(Files.exists(p) && Files.exists(JAVA_SOURCE), "Worker sources not present");
        assertAllPresent(fragments(read(p)), 6, "messages.ts");
    }

    @Test
    void everyWelcomeStringInTheWorkersNotificationsRouteExistsHere() throws IOException {
        Path p = WORKER.resolve(Path.of("routes", "notifications.ts"));
        Assumptions.assumeTrue(Files.exists(p) && Files.exists(JAVA_SOURCE), "Worker sources not present");
        String ts = read(p);
        int start = ts.indexOf("const WELCOME_MESSAGES");
        int end = ts.indexOf("notificationsRoute.post(\"/customer/:customerId/seed-welcome\"");
        assertThat(start).isGreaterThan(0);
        assertThat(end).isGreaterThan(start);
        assertAllPresent(fragments(ts.substring(start, end)), 4, "notifications.ts welcome block");
    }

    @Test
    void everyStringInTheWorkersAppFormatFileExistsHere() throws IOException {
        Path p = WORKER.resolve(Path.of("lib", "app-format.ts"));
        Assumptions.assumeTrue(Files.exists(p) && Files.exists(JAVA_SOURCE), "Worker sources not present");
        assertAllPresent(fragments(read(p)), 5, "app-format.ts");
    }

    @Test
    void everySectionLabelInTheWorkerExistsHere() throws IOException {
        Path p = WORKER.resolve(Path.of("lib", "sections.ts"));
        Assumptions.assumeTrue(Files.exists(p) && Files.exists(JAVA_SOURCE), "Worker sources not present");
        String ts = read(p);
        int start = ts.indexOf("export function sectionLabel");
        assertThat(start).isGreaterThan(0);
        int next = ts.indexOf("\nexport ", start + 10);
        assertAllPresent(fragments(ts.substring(start, next < 0 ? ts.length() : next)), 4, "sections.ts sectionLabel");
    }
}
