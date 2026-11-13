CREATE TABLE `letter_images` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`size_bytes` integer NOT NULL,
	`data_base64` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE TABLE `letter_saved_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rule_json` text NOT NULL,
	`updated_at` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `letter_templates` (
	`key` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_he` text DEFAULT '' NOT NULL,
	`description` text,
	`applies_to` text DEFAULT 'BOTH' NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE TABLE `letter_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_key` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`document_json` text NOT NULL,
	`change_note` text,
	`created_at` text NOT NULL,
	`created_by` text,
	`published_at` text,
	`published_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `letter_versions_template_version_unique` ON `letter_versions` (`template_key`,`version`);--> statement-breakpoint
CREATE TABLE `letters_issued` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_key` text NOT NULL,
	`template_version` integer NOT NULL,
	`application_ref` text NOT NULL,
	`issued_at` text NOT NULL,
	`issued_by` text,
	`data_json` text NOT NULL,
	`decisions_json` text NOT NULL,
	`generated_document_id` integer
);
--> statement-breakpoint
CREATE INDEX `letters_issued_app_idx` ON `letters_issued` (`application_ref`);