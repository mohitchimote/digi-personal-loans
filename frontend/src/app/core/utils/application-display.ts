/** Best-effort applicant/company display name from an application's raw section JSON — used
 * anywhere staff need a human label for a case (queue tables, dashboards, activity feeds). */
export function applicantDisplayName(app: {
  applicationType?: string;
  personalDetailsJson?: string | null;
  companyDetailsJson?: string | null;
  customerEmail: string;
}): string {
  try {
    if (app.applicationType === 'BUSINESS') {
      const c = JSON.parse(app.companyDetailsJson || '{}');
      return c.companyName || app.customerEmail;
    }
    const p = JSON.parse(app.personalDetailsJson || '{}');
    const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || app.customerEmail;
    const a2 = p.applicant2;
    const name2 = a2 ? `${a2.firstName || ''} ${a2.lastName || ''}`.trim() : '';
    return name2 ? `${name} & ${name2}` : name;
  } catch {
    return app.customerEmail;
  }
}

/** Best-effort loan amount from an application's raw section JSON. */
export function applicationLoanAmount(app: {
  applicationType?: string;
  loanRequirementsJson?: string | null;
  companyDetailsJson?: string | null;
}): number {
  try {
    if (app.applicationType === 'BUSINESS') {
      return Number(JSON.parse(app.companyDetailsJson || '{}').loanAmount) || 0;
    }
    return Number(JSON.parse(app.loanRequirementsJson || '{}').loanAmount) || 0;
  } catch {
    return 0;
  }
}
