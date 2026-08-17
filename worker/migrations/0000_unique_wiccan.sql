CREATE TABLE `affordability_rules` (
	`id` integer PRIMARY KEY NOT NULL,
	`max_dti` real DEFAULT 40 NOT NULL,
	`max_hti` real DEFAULT 35 NOT NULL,
	`min_monthly_income` real DEFAULT 8000 NOT NULL,
	`base_annual_rate` real DEFAULT 0.06 NOT NULL,
	`repayment_capacity_factor` real DEFAULT 0.4 NOT NULL,
	`min_credit_score` integer DEFAULT 5 NOT NULL,
	`auto_approval_threshold_single` real DEFAULT 30000 NOT NULL,
	`auto_approval_threshold_joint` real DEFAULT 50000 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `branding_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`primary_color` text DEFAULT '#003366' NOT NULL,
	`accent_color` text DEFAULT '#FBB034' NOT NULL,
	`logo_url` text
);
--> statement-breakpoint
CREATE TABLE `faqs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`video_id` text,
	`display_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generated_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_ref` text NOT NULL,
	`customer_id` integer NOT NULL,
	`document_type` text NOT NULL,
	`document_name` text NOT NULL,
	`file_path` text NOT NULL,
	`file_size` integer,
	`mime_type` text,
	`generated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `loan_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_ref` text NOT NULL,
	`customer_id` integer NOT NULL,
	`customer_email` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`current_section` text DEFAULT 'loanRequirements' NOT NULL,
	`completion_percentage` integer DEFAULT 0 NOT NULL,
	`application_type` text DEFAULT 'PERSONAL' NOT NULL,
	`loan_requirements_json` text,
	`consent_management_json` text,
	`personal_details_json` text,
	`bank_connection_json` text,
	`income_employment_json` text,
	`outgoings_json` text,
	`credit_declarations_json` text,
	`verify_id_json` text,
	`direct_debit_json` text,
	`review_submit_json` text,
	`disbursement_status` text,
	`selected_product_id` text,
	`selected_product_json` text,
	`affordability_result_json` text,
	`data_verification_json` text,
	`company_details_json` text,
	`signatories_json` text,
	`business_bank_connection_json` text,
	`business_financials_json` text,
	`business_outgoings_json` text,
	`business_credit_declarations_json` text,
	`business_financials_analysis_json` text,
	`guarantor_required` integer DEFAULT false NOT NULL,
	`guarantor_details_json` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	`submitted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_applications_application_ref_unique` ON `loan_applications` (`application_ref`);--> statement-breakpoint
CREATE TABLE `loan_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_code` text NOT NULL,
	`product_name` text NOT NULL,
	`description` text,
	`annual_interest_rate` real,
	`min_amount` real,
	`max_amount` real,
	`min_term_months` integer,
	`max_term_months` integer,
	`min_credit_score` integer,
	`min_monthly_income` real,
	`max_dti` real,
	`risk_categories` text,
	`active` integer DEFAULT true NOT NULL,
	`product_type` text DEFAULT 'PERSONAL' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_products_product_code_unique` ON `loan_products` (`product_code`);--> statement-breakpoint
CREATE TABLE `mandate_rules` (
	`id` integer PRIMARY KEY NOT NULL,
	`underwriter_limit` real DEFAULT 100000 NOT NULL,
	`senior_underwriter_limit` real DEFAULT 300000 NOT NULL,
	`head_of_lending_limit` real DEFAULT 750000 NOT NULL,
	`coo_limit` real DEFAULT 2000000 NOT NULL,
	`ceo_limit` real DEFAULT 999999999 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`type` text DEFAULT 'INFO' NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`application_ref` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pre_approved_offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`national_id` text NOT NULL,
	`product_code` text,
	`product_name` text,
	`annual_interest_rate` real,
	`amount` real,
	`term_months` integer,
	`monthly_repayment` real,
	`total_repayable` real,
	`consumed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_selections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_ref` text NOT NULL,
	`product_code` text,
	`product_name` text,
	`term_months` integer,
	`monthly_repayment` real,
	`total_repayable` real,
	`apr` real,
	`selected_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `underwriting_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_ref` text NOT NULL,
	`section` text NOT NULL,
	`note` text NOT NULL,
	`note_type` text DEFAULT 'NOTE' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploaded_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_ref` text NOT NULL,
	`customer_id` integer NOT NULL,
	`document_type` text NOT NULL,
	`original_filename` text NOT NULL,
	`storage_path` text NOT NULL,
	`file_size` integer,
	`mime_type` text,
	`uploaded_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`email` text NOT NULL,
	`national_id` text NOT NULL,
	`id_issue_date` text,
	`full_name` text,
	`phone_number` text,
	`role` text DEFAULT 'CUSTOMER' NOT NULL,
	`created_at` text NOT NULL,
	`last_login` text,
	`enabled` integer DEFAULT true NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`otp_code` text,
	`otp_expires_at` text,
	`otp_attempts` integer DEFAULT 0 NOT NULL,
	`company_name` text,
	`company_registration_number` text,
	`company_industry` text,
	`company_founded_year` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_uuid_unique` ON `users` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_national_id_unique` ON `users` (`national_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_company_registration_number_unique` ON `users` (`company_registration_number`);