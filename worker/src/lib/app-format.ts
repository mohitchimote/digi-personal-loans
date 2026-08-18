// Shared between applications.ts (in-app notification text) and email.ts (templated email
// variables) — relocated here so both can reuse the same safe-parse-with-fallback logic without
// an awkward cross-import between route and lib files.

export function greeting(app: { personalDetailsJson: string | null }): string {
  try {
    if (app.personalDetailsJson) {
      const parsed = JSON.parse(app.personalDetailsJson);
      if (parsed.firstName?.trim()) return `Dear ${parsed.firstName},`;
    }
  } catch {
    /* ignore */
  }
  return "Dear Customer,";
}

export function applicantFirstName(app: { personalDetailsJson: string | null }): string {
  try {
    if (app.personalDetailsJson) {
      const parsed = JSON.parse(app.personalDetailsJson);
      if (parsed.firstName?.trim()) return parsed.firstName;
    }
  } catch {
    /* ignore */
  }
  return "Customer";
}

export function loanPurpose(app: { loanRequirementsJson: string | null }): string {
  try {
    if (app.loanRequirementsJson) {
      const parsed = JSON.parse(app.loanRequirementsJson);
      if (parsed.loanPurpose?.trim()) return parsed.loanPurpose;
    }
  } catch {
    /* ignore */
  }
  return "your requested purpose";
}
