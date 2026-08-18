CREATE TABLE `email_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`to_address` text,
	`cc_address` text,
	`subject` text DEFAULT '' NOT NULL,
	`header_content` text,
	`body_content` text DEFAULT '' NOT NULL,
	`signature` text,
	`footer` text,
	`updated_at` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_templates_event_key_unique` ON `email_templates` (`event_key`);