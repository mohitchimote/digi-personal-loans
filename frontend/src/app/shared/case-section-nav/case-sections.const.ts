export interface CaseSectionDef { key: string; labelKey: string; route: string; }

/** Single source of truth for "what sections does a personal/business application have, and
 * which real wizard route does each map to" — shared by BankerCaseDetailComponent (renders the
 * left nav) and BankerApplyShellComponent (navigates into the actual wizard step). `route`
 * matches the same URL slugs already used under /portal/apply/* and /business/apply/*.
 * `review-submit` is deliberately not listed here — submitting/affordability/products on behalf
 * of a customer is out of scope for this round (see plan). */
export const PERSONAL_CASE_SECTIONS: CaseSectionDef[] = [
  { key: 'loanRequirements',   labelKey: 'steps.loanRequirements',   route: 'loan-requirements' },
  { key: 'personalDetails',    labelKey: 'steps.personalDetails',    route: 'personal-details' },
  { key: 'connectBank',        labelKey: 'steps.connectBank',        route: 'connect-bank' },
  { key: 'incomeEmployment',   labelKey: 'steps.incomeEmployment',   route: 'income-employment' },
  { key: 'outgoings',          labelKey: 'outgoings.title',          route: 'outgoings' },
  { key: 'creditDeclarations', labelKey: 'steps.creditDeclarations', route: 'credit-declarations' },
  { key: 'verifyId',           labelKey: 'steps.verifyId',           route: 'verify-id' },
  { key: 'guarantorDetails',   labelKey: 'guarantor.title',          route: 'guarantor-details' },
  { key: 'directDebit',        labelKey: 'steps.directDebit',        route: 'direct-debit' },
];

export const BUSINESS_CASE_SECTIONS: CaseSectionDef[] = [
  { key: 'companyDetails',             labelKey: 'company.detailsTitle',     route: 'company-details' },
  { key: 'signatories',                labelKey: 'company.signatoriesTitle', route: 'signatories' },
  { key: 'connectBusinessBank',        labelKey: 'company.connectBankTitle', route: 'connect-bank' },
  { key: 'businessFinancials',         labelKey: 'company.financialsTitle', route: 'financials' },
  { key: 'businessOutgoings',          labelKey: 'company.outgoingsTitle',   route: 'outgoings' },
  { key: 'businessCreditDeclarations', labelKey: 'company.creditTitle',      route: 'credit-declarations' },
  { key: 'verifyId',                   labelKey: 'steps.verifyId',           route: 'verify-id' },
  { key: 'guarantorDetails',           labelKey: 'guarantor.title',          route: 'guarantor-details' },
  { key: 'directDebit',                labelKey: 'steps.directDebit',        route: 'direct-debit' },
];
