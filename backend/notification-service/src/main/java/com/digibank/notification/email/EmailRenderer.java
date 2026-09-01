package com.digibank.notification.email;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Ports worker/src/lib/email.ts's renderTemplate/escapeHtml/substitute/wrapBrandedHtml/
 * renderPlainText/splitAddresses exactly (variable substitution + the fixed branded HTML shell).
 */
@Component
public class EmailRenderer {

    // The Worker's own public origin isn't in an env var here either (same as the Worker — out of
    // this feature's approved scope) — a relative logoUrl is resolved against the deployed custom
    // domain. If branding has no logo yet, the shell falls back to a text wordmark instead of an
    // <img>, same as the Worker.
    private static final String PUBLIC_ORIGIN = "https://is.personalloans.tcsdigilend.com";

    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{\\{\\s*(\\w+)\\s*\\}\\}");

    private String escapeHtml(String str) {
        if (str == null) return null;
        return str.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private String substitute(String text, Map<String, String> variables) {
        if (text == null) return null;
        Matcher matcher = VARIABLE_PATTERN.matcher(text);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            String name = matcher.group(1);
            String replacement = variables.containsKey(name) ? variables.get(name) : matcher.group();
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    private String renderHtmlField(String raw, Map<String, String> escapedVariables) {
        if (raw == null || raw.isEmpty()) return "";
        return substitute(escapeHtml(raw), escapedVariables).replace("\n", "<br>");
    }

    private String wrapBrandedHtml(BrandingInfo branding, String header, String body, String signature, String footer) {
        String primary = (branding.primaryColor() != null && !branding.primaryColor().isBlank()) ? branding.primaryColor() : "#003366";
        String logoUrl = branding.logoUrl();
        String logoSrc = logoUrl != null ? (logoUrl.startsWith("http") ? logoUrl : PUBLIC_ORIGIN + logoUrl) : null;
        String logoBlock = logoSrc != null
                ? "<img src=\"" + logoSrc + "\" alt=\"\" height=\"32\" style=\"display:block;border:0;\" />"
                : "<span style=\"color:#ffffff;font-size:18px;font-weight:700;font-family:Arial,Helvetica,sans-serif;\">DigiLend</span>";

        return "<!doctype html>\n"
                + "<html>\n"
                + "  <body style=\"margin:0;padding:0;background:#f4f6f9;\">\n"
                + "    <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f4f6f9;padding:24px 0;\">\n"
                + "      <tr>\n"
                + "        <td align=\"center\">\n"
                + "          <table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#ffffff;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;\">\n"
                + "            <tr>\n"
                + "              <td style=\"background:" + primary + ";padding:20px 32px;\">" + logoBlock + "</td>\n"
                + "            </tr>\n"
                + "            <tr>\n"
                + "              <td style=\"padding:32px;color:#1a1a1a;font-size:14px;line-height:1.6;\">\n"
                + "                " + (!header.isEmpty() ? "<div style=\"margin-bottom:20px;\">" + header + "</div>" : "") + "\n"
                + "                <div>" + body + "</div>\n"
                + "                " + (!signature.isEmpty() ? "<div style=\"margin-top:24px;\">" + signature + "</div>" : "") + "\n"
                + "              </td>\n"
                + "            </tr>\n"
                + "            " + (!footer.isEmpty() ? "<tr><td style=\"padding:16px 32px;background:#f7f9fc;color:#8a9bb0;font-size:12px;line-height:1.5;\">" + footer + "</td></tr>" : "") + "\n"
                + "          </table>\n"
                + "        </td>\n"
                + "      </tr>\n"
                + "    </table>\n"
                + "  </body>\n"
                + "</html>";
    }

    private String renderPlainText(TemplateFields fields, Map<String, String> variables) {
        List<String> parts = new ArrayList<>();
        for (String s : List.of(
                fields.headerContent() != null ? fields.headerContent() : "",
                fields.bodyContent() != null ? fields.bodyContent() : "",
                fields.signature() != null ? fields.signature() : "",
                fields.footer() != null ? fields.footer() : "")) {
            if (s != null && !s.trim().isEmpty()) parts.add(substitute(s, variables));
        }
        return String.join("\n\n", parts);
    }

    public RenderedEmail render(BrandingInfo branding, TemplateFields fields, Map<String, String> variables) {
        Map<String, String> escapedVariables = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            escapedVariables.put(entry.getKey(), escapeHtml(entry.getValue()));
        }
        String subject = substitute(fields.subject(), variables);
        String html = wrapBrandedHtml(branding,
                renderHtmlField(fields.headerContent(), escapedVariables),
                renderHtmlField(fields.bodyContent(), escapedVariables),
                renderHtmlField(fields.signature(), escapedVariables),
                renderHtmlField(fields.footer(), escapedVariables));
        String text = renderPlainText(fields, variables);
        return new RenderedEmail(subject, html, text);
    }

    public List<String> splitAddresses(String raw) {
        if (raw == null) return null;
        List<String> list = new ArrayList<>();
        for (String part : raw.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) list.add(trimmed);
        }
        return list.isEmpty() ? null : list;
    }
}
