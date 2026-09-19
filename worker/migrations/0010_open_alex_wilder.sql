CREATE TABLE `form_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form_key` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`schema_json` text NOT NULL,
	`change_note` text,
	`created_at` text NOT NULL,
	`created_by` text,
	`published_at` text,
	`published_by` text
);
--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `form_version_id` integer;