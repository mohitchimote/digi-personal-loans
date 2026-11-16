-- Multi-tenancy (lenders), phase 1. See MULTI_TENANCY_DESIGN.md.
-- Additive and backward compatible: every existing row becomes lender 1 (DIGI), and every new
-- lender_id column defaults to 1, so code that does not know about lenders yet keeps working.
-- Unique keys that were global become per lender.

CREATE TABLE `lenders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lenders_code_unique` ON `lenders` (`code`);
--> statement-breakpoint
INSERT INTO `lenders` (`id`, `code`, `name`, `status`, `created_at`) VALUES (1, 'DIGI', 'DigiBank', 'ACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
--> statement-breakpoint
CREATE TABLE `lender_settings` (
	`lender_id` integer NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text,
	PRIMARY KEY(`lender_id`, `key`)
);
--> statement-breakpoint

-- ---- Columns only (no key change) ----
ALTER TABLE `mandates` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_definitions` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_cases` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_case_tracks` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_transitions` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `case_referrals` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `underwriting_notes` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `faqs` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `generated_documents` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `uploaded_documents` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `notifications` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `pre_approved_offers` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `product_selections` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `audit_log` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `form_versions` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `letter_saved_rules` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `letter_images` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `letters_issued` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint

-- ---- Users: nullable lender_id (NULL = super admin). Per-lender uniques; separate ones for super admins. ----
ALTER TABLE `users` ADD `lender_id` integer;
--> statement-breakpoint
UPDATE `users` SET `lender_id` = 1;
--> statement-breakpoint
DROP INDEX `users_email_unique`;
--> statement-breakpoint
DROP INDEX `users_national_id_unique`;
--> statement-breakpoint
DROP INDEX `users_company_registration_number_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_lender_email_unique` ON `users` (`lender_id`, `email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_lender_national_id_unique` ON `users` (`lender_id`, `national_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_lender_company_reg_unique` ON `users` (`lender_id`, `company_registration_number`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_super_email_unique` ON `users` (`email`) WHERE `lender_id` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_super_national_id_unique` ON `users` (`national_id`) WHERE `lender_id` IS NULL;
--> statement-breakpoint

-- ---- Per-lender uniques on tables whose keys are plain indexes ----
ALTER TABLE `org_levels` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
DROP INDEX `org_levels_name_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `org_levels_lender_name_unique` ON `org_levels` (`lender_id`, `name`);
--> statement-breakpoint
ALTER TABLE `org_units` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
DROP INDEX `org_units_code_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `org_units_lender_code_unique` ON `org_units` (`lender_id`, `code`);
--> statement-breakpoint
ALTER TABLE `loan_products` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
DROP INDEX `loan_products_product_code_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_products_lender_code_unique` ON `loan_products` (`lender_id`, `product_code`);
--> statement-breakpoint
ALTER TABLE `email_templates` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
DROP INDEX `email_templates_event_key_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `email_templates_lender_event_unique` ON `email_templates` (`lender_id`, `event_key`);
--> statement-breakpoint
ALTER TABLE `master_items` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
DROP INDEX `master_items_type_code_unique`;
--> statement-breakpoint
DROP INDEX `master_items_type_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `master_items_lender_type_code_unique` ON `master_items` (`lender_id`, `type_code`, `code`);
--> statement-breakpoint
CREATE INDEX `master_items_lender_type_idx` ON `master_items` (`lender_id`, `type_code`);
--> statement-breakpoint
ALTER TABLE `letter_versions` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
DROP INDEX `letter_versions_template_version_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `letter_versions_lender_template_version_unique` ON `letter_versions` (`lender_id`, `template_key`, `version`);
--> statement-breakpoint

-- ---- One settings row per lender (these tables held a single row with id 1) ----
ALTER TABLE `branding_settings` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `branding_settings_lender_unique` ON `branding_settings` (`lender_id`);
--> statement-breakpoint
ALTER TABLE `affordability_rules` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `affordability_rules_lender_unique` ON `affordability_rules` (`lender_id`);
--> statement-breakpoint
ALTER TABLE `mandate_rules` ADD `lender_id` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `mandate_rules_lender_unique` ON `mandate_rules` (`lender_id`);
--> statement-breakpoint

-- ---- Tables whose primary key changes: rebuilt with (lender_id, code) ----
CREATE TABLE `roles_new` (
	`lender_id` integer DEFAULT 1 NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`scope` text DEFAULT 'ALL' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`escalation_rank` integer,
	PRIMARY KEY(`lender_id`, `code`)
);
--> statement-breakpoint
INSERT INTO `roles_new` (`lender_id`, `code`, `label`, `description`, `scope`, `is_system`, `locked`, `created_at`, `escalation_rank`)
	SELECT 1, `code`, `label`, `description`, `scope`, `is_system`, `locked`, `created_at`, `escalation_rank` FROM `roles`;
--> statement-breakpoint
DROP TABLE `roles`;
--> statement-breakpoint
ALTER TABLE `roles_new` RENAME TO `roles`;
--> statement-breakpoint
CREATE TABLE `role_entitlements_new` (
	`lender_id` integer DEFAULT 1 NOT NULL,
	`role_code` text NOT NULL,
	`entitlement` text NOT NULL,
	PRIMARY KEY(`lender_id`, `role_code`, `entitlement`)
);
--> statement-breakpoint
INSERT INTO `role_entitlements_new` (`lender_id`, `role_code`, `entitlement`) SELECT 1, `role_code`, `entitlement` FROM `role_entitlements`;
--> statement-breakpoint
DROP TABLE `role_entitlements`;
--> statement-breakpoint
ALTER TABLE `role_entitlements_new` RENAME TO `role_entitlements`;
--> statement-breakpoint
CREATE TABLE `master_types_new` (
	`lender_id` integer DEFAULT 1 NOT NULL,
	`code` text NOT NULL,
	`label_en` text NOT NULL,
	`label_he` text NOT NULL,
	`description` text,
	`parent_type_code` text,
	`attribute_defs` text DEFAULT '[]' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`parent_required` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`lender_id`, `code`)
);
--> statement-breakpoint
INSERT INTO `master_types_new` (`lender_id`, `code`, `label_en`, `label_he`, `description`, `parent_type_code`, `attribute_defs`, `is_system`, `sort_order`, `created_at`, `parent_required`)
	SELECT 1, `code`, `label_en`, `label_he`, `description`, `parent_type_code`, `attribute_defs`, `is_system`, `sort_order`, `created_at`, `parent_required` FROM `master_types`;
--> statement-breakpoint
DROP TABLE `master_types`;
--> statement-breakpoint
ALTER TABLE `master_types_new` RENAME TO `master_types`;
--> statement-breakpoint
CREATE TABLE `letter_templates_new` (
	`lender_id` integer DEFAULT 1 NOT NULL,
	`key` text NOT NULL,
	`name_en` text NOT NULL,
	`name_he` text DEFAULT '' NOT NULL,
	`description` text,
	`applies_to` text DEFAULT 'BOTH' NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	PRIMARY KEY(`lender_id`, `key`)
);
--> statement-breakpoint
INSERT INTO `letter_templates_new` (`lender_id`, `key`, `name_en`, `name_he`, `description`, `applies_to`, `created_at`, `created_by`)
	SELECT 1, `key`, `name_en`, `name_he`, `description`, `applies_to`, `created_at`, `created_by` FROM `letter_templates`;
--> statement-breakpoint
DROP TABLE `letter_templates`;
--> statement-breakpoint
ALTER TABLE `letter_templates_new` RENAME TO `letter_templates`;
--> statement-breakpoint

-- ---- Lookup indexes for the lender filter on the busiest tables ----
CREATE INDEX `loan_applications_lender_idx` ON `loan_applications` (`lender_id`);
--> statement-breakpoint
CREATE INDEX `audit_log_lender_idx` ON `audit_log` (`lender_id`);
