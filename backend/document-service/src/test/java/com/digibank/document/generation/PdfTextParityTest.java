package com.digibank.document.generation;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** Every piece of document text in the Worker's pdf-lib generators must exist in the Java generators. */
class PdfTextParityTest {

    private static final Path WORKER_PDF = Path.of("..", "..", "worker", "src", "lib", "pdf");
    private static final Path JAVA_DIR = Path.of("src", "main", "java", "com", "digibank", "document", "generation");
    private static final Pattern LITERAL = Pattern.compile("\"((?:[^\"\\\\]|\\\\.)*)\"|'((?:[^'\\\\]|\\\\.)*)'|`((?:[^`\\\\]|\\\\.)*)`");

    private static String norm(String s) {
        return s.replaceAll("\\s+", " ").trim();
    }

    private static String javaBlob() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (String f : List.of("PdfGeneratorService.java", "GenerationService.java")) {
            Matcher m = Pattern.compile("\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(Files.readString(JAVA_DIR.resolve(f), StandardCharsets.UTF_8));
            while (m.find()) sb.append(m.group(1).replace("\\\"", "\"").replace("\\'", "'"));
            sb.append(' ');
        }
        return norm(sb.toString());
    }

    private static String code(String ts) {
        String noBlock = ts.replaceAll("(?s)/\\*.*?\\*/", "");
        StringBuilder sb = new StringBuilder();
        for (String line : noBlock.split("\n")) if (!line.trim().startsWith("//")) sb.append(line).append('\n');
        return sb.toString();
    }

    @Test
    void everyWorkerDocumentStringExistsInTheJavaGenerators() throws IOException {
        Assumptions.assumeTrue(Files.isDirectory(WORKER_PDF) && Files.isDirectory(JAVA_DIR), "Worker sources not present");
        String blob = javaBlob();
        List<String> missing = new ArrayList<>();
        try (var files = Files.list(WORKER_PDF)) {
            for (Path f : files.filter(p -> p.toString().endsWith(".ts")).toList()) {
                Matcher m = LITERAL.matcher(code(Files.readString(f, StandardCharsets.UTF_8)));
                while (m.find()) {
                    String lit = m.group(1) != null ? m.group(1) : m.group(2) != null ? m.group(2) : m.group(3);
                    lit = lit.replace("\\\"", "\"").replace("\\'", "'");
                    for (String part : lit.split("\\$\\{[^}]*\\}")) {
                        String p = norm(part);
                        // import paths, and the Intl date-format option values (not document text)
                        if (p.length() < 6 || p.startsWith(".") || p.startsWith("pdf-lib")
                                || p.equals("2-digit") || p.equals("numeric")) continue;
                        if (!blob.contains(p)) missing.add(f.getFileName() + ": " + p);
                    }
                }
            }
        }
        assertThat(missing).isEmpty();
    }
}
