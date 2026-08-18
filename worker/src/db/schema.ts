import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Money fields use `real()` (float) rather than a fixed-point type — D1/SQLite
// has no native DECIMAL. Acceptable for a sandbox demo at these amounts; if
// this ever needs production-grade precision, switch to integer cents.
// Timestamps are ISO-8601 strings (text), not SQLite's integer-seconds mode,
// so they serialize identically to what the Angular app already expects from
// the Java backend's LocalDateTime JSON.

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uuid: text("uuid").notNull().unique(),
  email: text("email").notNull().unique(),
  nationalId: text("national_id").notNull().unique(),
  idIssueDate: text("id_issue_date"),
  fullName: text("full_name"),
  phoneNumber: text("phone_number"),
  role: text("role").notNull().default("CUSTOMER"),
  createdAt: text("created_at").notNull(),
  lastLogin: text("last_login"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  otpCode: text("otp_code"),
  otpExpiresAt: text("otp_expires_at"),
  otpAttempts: integer("otp_attempts").notNull().default(0),
  // Business accounts only (role = BUSINESS_OWNER) — null for personal customers/staff.
  companyName: text("company_name"),
  companyRegistrationNumber: text("company_registration_number").unique(),
  companyIndustry: text("company_industry"),
  companyFoundedYear: integer("company_founded_year"),
});

export const loanApplications = sqliteTable("loan_applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationRef: text("application_ref").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  customerEmail: text("customer_email").notNull(),
  status: text("status").notNull().default("DRAFT"),
  currentSection: text("current_section").notNull().default("loanRequirements"),
  completionPercentage: integer("completion_percentage").notNull().default(0),
  applicationType: text("application_type").notNull().default("PERSONAL"),

  // Personal journey — one nullable JSON TEXT column per wizard section.
  loanRequirementsJson: text("loan_requirements_json"),
  consentManagementJson: text("consent_management_json"),
  personalDetailsJson: text("personal_details_json"),
  bankConnectionJson: text("bank_connection_json"),
  incomeEmploymentJson: text("income_employment_json"),
  outgoingsJson: text("outgoings_json"),
  creditDeclarationsJson: text("credit_declarations_json"),
  verifyIdJson: text("verify_id_json"),
  directDebitJson: text("direct_debit_json"),
  reviewSubmitJson: text("review_submit_json"),

  disbursementStatus: text("disbursement_status"),
  approvedAmount: real("approved_amount"),
  selectedProductId: text("selected_product_id"),
  selectedProductJson: text("selected_product_json"),
  affordabilityResultJson: text("affordability_result_json"),
  dataVerificationJson: text("data_verification_json"),

  // Business journey — parallel section columns.
  companyDetailsJson: text("company_details_json"),
  signatoriesJson: text("signatories_json"),
  businessBankConnectionJson: text("business_bank_connection_json"),
  businessFinancialsJson: text("business_financials_json"),
  businessOutgoingsJson: text("business_outgoings_json"),
  businessCreditDeclarationsJson: text("business_credit_declarations_json"),
  businessFinancialsAnalysisJson: text("business_financials_analysis_json"),

  guarantorRequired: integer("guarantor_required", { mode: "boolean" }).notNull().default(false),
  guarantorDetailsJson: text("guarantor_details_json"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
  submittedAt: text("submitted_at"),
});

export const underwritingNotes = sqliteTable("underwriting_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationRef: text("application_ref").notNull(),
  section: text("section").notNull(),
  note: text("note").notNull(),
  noteType: text("note_type").notNull().default("NOTE"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const brandingSettings = sqliteTable("branding_settings", {
  id: integer("id").primaryKey(),
  primaryColor: text("primary_color").notNull().default("#003366"),
  secondaryColor: text("secondary_color").notNull().default("#002244"),
  accentColor: text("accent_color").notNull().default("#FBB034"),
  logoUrl: text("logo_url"),
});

export const faqs = sqliteTable("faqs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  videoId: text("video_id"),
  displayOrder: integer("display_order").notNull().default(0),
});

export const generatedDocuments = sqliteTable("generated_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationRef: text("application_ref").notNull(),
  customerId: integer("customer_id").notNull(),
  documentType: text("document_type").notNull(),
  documentName: text("document_name").notNull(),
  // R2 object key (was a local filesystem path in the Java version).
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  generatedAt: text("generated_at").notNull(),
});

export const uploadedDocuments = sqliteTable("uploaded_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationRef: text("application_ref").notNull(),
  customerId: integer("customer_id").notNull(),
  documentType: text("document_type").notNull(),
  originalFilename: text("original_filename").notNull(),
  // R2 object key (was a local filesystem path in the Java version).
  storagePath: text("storage_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  uploadedAt: text("uploaded_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("INFO"),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  applicationRef: text("application_ref"),
  createdAt: text("created_at").notNull(),
});

export const loanProducts = sqliteTable("loan_products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productCode: text("product_code").notNull().unique(),
  productName: text("product_name").notNull(),
  description: text("description"),
  annualInterestRate: real("annual_interest_rate"),
  minAmount: real("min_amount"),
  maxAmount: real("max_amount"),
  minTermMonths: integer("min_term_months"),
  maxTermMonths: integer("max_term_months"),
  minCreditScore: integer("min_credit_score"),
  minMonthlyIncome: real("min_monthly_income"),
  maxDti: real("max_dti"),
  riskCategories: text("risk_categories"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  productType: text("product_type").notNull().default("PERSONAL"),
});

export const preApprovedOffers = sqliteTable("pre_approved_offers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nationalId: text("national_id").notNull(),
  productCode: text("product_code"),
  productName: text("product_name"),
  annualInterestRate: real("annual_interest_rate"),
  amount: real("amount"),
  termMonths: integer("term_months"),
  monthlyRepayment: real("monthly_repayment"),
  totalRepayable: real("total_repayable"),
  consumed: integer("consumed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const productSelections = sqliteTable("product_selections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationRef: text("application_ref").notNull(),
  productCode: text("product_code"),
  productName: text("product_name"),
  termMonths: integer("term_months"),
  monthlyRepayment: real("monthly_repayment"),
  totalRepayable: real("total_repayable"),
  apr: real("apr"),
  selectedAt: text("selected_at").notNull(),
});

// Both of these were in-memory Spring @Component beans in the Java version
// (reset to defaults on every service restart). Persisting them to D1 as
// single-row tables is a strict improvement, not a scope addition — same
// admin-editable behavior, but it now survives a redeploy.

export const affordabilityRules = sqliteTable("affordability_rules", {
  id: integer("id").primaryKey(),
  maxDti: real("max_dti").notNull().default(40),
  maxHti: real("max_hti").notNull().default(35),
  minMonthlyIncome: real("min_monthly_income").notNull().default(8000),
  baseAnnualRate: real("base_annual_rate").notNull().default(0.06),
  repaymentCapacityFactor: real("repayment_capacity_factor").notNull().default(0.4),
  minCreditScore: integer("min_credit_score").notNull().default(5),
  autoApprovalThresholdSingle: real("auto_approval_threshold_single").notNull().default(30000),
  autoApprovalThresholdJoint: real("auto_approval_threshold_joint").notNull().default(50000),
});

export const mandateRules = sqliteTable("mandate_rules", {
  id: integer("id").primaryKey(),
  underwriterLimit: real("underwriter_limit").notNull().default(100000),
  seniorUnderwriterLimit: real("senior_underwriter_limit").notNull().default(300000),
  headOfLendingLimit: real("head_of_lending_limit").notNull().default(750000),
  cooLimit: real("coo_limit").notNull().default(2000000),
  ceoLimit: real("ceo_limit").notNull().default(999999999),
});

// One row per lifecycle event key (see lib/email-events.ts's EVENT_REGISTRY for the fixed list of
// valid keys). Rows are lazily seeded on first read rather than pre-populated by a migration, so
// the event list can grow later without a schema change — see lib/email.ts's getOrSeedTemplate.
export const emailTemplates = sqliteTable("email_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventKey: text("event_key").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  toAddress: text("to_address"),
  ccAddress: text("cc_address"),
  subject: text("subject").notNull().default(""),
  headerContent: text("header_content"),
  bodyContent: text("body_content").notNull().default(""),
  signature: text("signature"),
  footer: text("footer"),
  updatedAt: text("updated_at"),
  updatedBy: text("updated_by"),
});
