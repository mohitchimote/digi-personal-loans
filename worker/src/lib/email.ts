import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../types";
import { emailTemplates, brandingSettings, type loanApplications } from "../db/schema";
import { applicantFirstName, loanPurpose } from "./app-format";
import { withTimeout, withRetry, CircuitBreaker, TimeoutError } from "./resilience";

type TemplateFields = {
  subject: string;
  headerContent?: string | null;
  bodyContent: string;
  signature?: string | null;
  footer?: string | null;
};

type BrandingInfo = { primaryColor: string; logoUrl: string | null };

// The Worker's own public origin isn't in an env var (out of this feature's approved scope), so a
// relative logoUrl (see routes/branding.ts's upload handler) is resolved against the deployed
// custom domain from wrangler.toml. If branding has no logo yet, the shell falls back to a text
// wordmark instead of an <img>.
const PUBLIC_ORIGIN = "https://is.personalloans.tcsdigilend.com";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function substitute(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => (name in variables ? variables[name] : match));
}

function renderHtmlField(raw: string | null | undefined, escapedVariables: Record<string, string>): string {
  if (!raw) return "";
  return substitute(escapeHtml(raw), escapedVariables).replace(/\n/g, "<br>");
}

function wrapBrandedHtml(branding: BrandingInfo, sections: { header: string; body: string; signature: string; footer: string }): string {
  const primary = branding.primaryColor || "#003366";
  const logoSrc = branding.logoUrl ? (branding.logoUrl.startsWith("http") ? branding.logoUrl : `${PUBLIC_ORIGIN}${branding.logoUrl}`) : null;
  const logoBlock = logoSrc
    ? `<img src="${logoSrc}" alt="" height="32" style="display:block;border:0;" />`
    : `<span style="color:#ffffff;font-size:18px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">DigiLend</span>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="background:${primary};padding:20px 32px;">${logoBlock}</td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1a1a1a;font-size:14px;line-height:1.6;">
                ${sections.header ? `<div style="margin-bottom:20px;">${sections.header}</div>` : ""}
                <div>${sections.body}</div>
                ${sections.signature ? `<div style="margin-top:24px;">${sections.signature}</div>` : ""}
              </td>
            </tr>
            ${sections.footer ? `<tr><td style="padding:16px 32px;background:#f7f9fc;color:#8a9bb0;font-size:12px;line-height:1.5;">${sections.footer}</td></tr>` : ""}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderPlainText(fields: TemplateFields, variables: Record<string, string>): string {
  const parts = [fields.headerContent, fields.bodyContent, fields.signature, fields.footer]
    .filter((s): s is string => !!s?.trim())
    .map((s) => substitute(s, variables));
  return parts.join("\n\n");
}

export function renderTemplate(branding: BrandingInfo, fields: TemplateFields, variables: Record<string, string>) {
  const escapedVariables = Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, escapeHtml(v)]));
  const subject = substitute(fields.subject, variables);
  const html = wrapBrandedHtml(branding, {
    header: renderHtmlField(fields.headerContent, escapedVariables),
    body: renderHtmlField(fields.bodyContent, escapedVariables),
    signature: renderHtmlField(fields.signature, escapedVariables),
    footer: renderHtmlField(fields.footer, escapedVariables),
  });
  const text = renderPlainText(fields, variables);
  return { subject, html, text };
}

export function splitAddresses(raw: string | null | undefined): string[] | undefined {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

export async function getBrandingForEmail(db: Db): Promise<BrandingInfo> {
  const [existing] = await db.select().from(brandingSettings).where(eq(brandingSettings.id, 1)).limit(1);
  return { primaryColor: existing?.primaryColor ?? "#003366", logoUrl: existing?.logoUrl ?? null };
}

type DeliverResult = { ok: true } | { ok: false; error: string };

// A 5xx or a network/timeout error is plausibly transient (Resend having a bad moment); a 4xx
// (bad request, invalid key, rate-limited) will not be fixed by retrying with the same payload.
class ResendHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// Module-scope so it persists across requests within the same warm isolate: 5 consecutive
// failures trips it open for 30s, giving Resend room to recover and sparing callers the cost of
// a doomed request during an outage.
const resendBreaker = new CircuitBreaker(5, 30_000);

async function deliverEmailOnce(env: Env, payload: { to: string; cc?: string[]; subject: string; html: string; text: string }) {
  const res = await withTimeout(
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: payload.to,
        ...(payload.cc ? { cc: payload.cc } : {}),
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    }),
    8_000
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ResendHttpError(res.status, `Resend responded ${res.status}: ${detail || res.statusText}`);
  }
}

// Thin wrapper around Resend's HTTP API — the first outbound third-party integration in this
// Worker. Wrapped with a timeout + bounded retry + circuit breaker so a slow or unavailable
// Resend never turns into a hung request or a cascade of doomed retries; callers still decide
// whether a failure should be swallowed (production sends, via sendTemplatedEmail below) or
// surfaced (the admin "send test" action).
export async function deliverEmail(
  env: Env,
  payload: { to: string; cc?: string[]; subject: string; html: string; text: string }
): Promise<DeliverResult> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY is not configured on this Worker yet." };
  }
  try {
    await resendBreaker.run(() =>
      withRetry(() => deliverEmailOnce(env, payload), {
        retries: 2,
        baseDelayMs: 500,
        retryable: (e) => e instanceof TimeoutError || (e instanceof ResendHttpError && e.status >= 500),
      })
    );
    return { ok: true };
  } catch (e) {
    if (e instanceof TimeoutError) return { ok: false, error: `Resend call timed out: ${e.message}` };
    if (e instanceof ResendHttpError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error calling Resend." };
  }
}

// Best-effort, fire-and-forget — mirrors sendNotification()'s "never throw" convention so a
// Resend outage or a missing/disabled template never blocks the underlying business action
// (approve, decline, etc).
export async function sendTemplatedEmail(
  db: Db,
  env: Env,
  eventKey: string,
  app: typeof loanApplications.$inferSelect,
  extraVariables: Record<string, string>
) {
  try {
    const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.eventKey, eventKey)).limit(1);
    if (!template || !template.enabled) return;

    const to = template.toAddress?.trim() || app.customerEmail;
    if (!to) return;
    const cc = splitAddresses(template.ccAddress);

    const variables: Record<string, string> = {
      applicantName: applicantFirstName(app),
      applicationRef: app.applicationRef,
      loanPurpose: loanPurpose(app),
      ...extraVariables,
    };

    const branding = await getBrandingForEmail(db);
    const rendered = renderTemplate(branding, template, variables);
    const result = await deliverEmail(env, { to, cc, subject: rendered.subject, html: rendered.html, text: rendered.text });
    if (!result.ok) {
      console.error(`sendTemplatedEmail: ${eventKey} send failed:`, result.error);
    }
  } catch (e) {
    console.error(`sendTemplatedEmail failed for ${eventKey} (non-fatal):`, e);
  }
}
