CREATE TABLE `wf_case_tracks` (
	`application_ref` text NOT NULL,
	`track_key` text NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`entered_at` text NOT NULL,
	`assignee_user_id` integer,
	PRIMARY KEY(`application_ref`, `track_key`)
);
--> statement-breakpoint
CREATE TABLE `wf_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_ref` text NOT NULL,
	`definition_id` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wf_cases_application_ref_unique` ON `wf_cases` (`application_ref`);--> statement-breakpoint
CREATE TABLE `wf_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`definition_key` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`definition_json` text NOT NULL,
	`change_note` text,
	`created_at` text NOT NULL,
	`created_by` text,
	`published_at` text,
	`published_by` text
);
--> statement-breakpoint
CREATE TABLE `wf_transitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_ref` text NOT NULL,
	`track_key` text NOT NULL,
	`action` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`from_stage` text,
	`to_stage` text,
	`actor_type` text NOT NULL,
	`actor_user_id` integer NOT NULL,
	`actor_name` text NOT NULL,
	`actor_role` text,
	`reason` text,
	`at` text NOT NULL,
	`definition_id` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_transitions_application_ref_idx` ON `wf_transitions` (`application_ref`);
--> statement-breakpoint
CREATE INDEX `wf_definitions_key_status_idx` ON `wf_definitions` (`definition_key`, `status`);
--> statement-breakpoint
INSERT INTO `mandates` (`role_code`, `max_amount`) SELECT 'UNDERWRITER', 100000 WHERE NOT EXISTS (SELECT 1 FROM `mandates` WHERE `role_code` = 'UNDERWRITER' AND `org_unit_id` IS NULL AND `application_type` IS NULL);
--> statement-breakpoint
INSERT INTO `mandates` (`role_code`, `max_amount`) SELECT 'SENIOR_UNDERWRITER', 300000 WHERE NOT EXISTS (SELECT 1 FROM `mandates` WHERE `role_code` = 'SENIOR_UNDERWRITER' AND `org_unit_id` IS NULL AND `application_type` IS NULL);
--> statement-breakpoint
INSERT INTO `mandates` (`role_code`, `max_amount`) SELECT 'HEAD_OF_LENDING', 750000 WHERE NOT EXISTS (SELECT 1 FROM `mandates` WHERE `role_code` = 'HEAD_OF_LENDING' AND `org_unit_id` IS NULL AND `application_type` IS NULL);
--> statement-breakpoint
INSERT INTO `mandates` (`role_code`, `max_amount`) SELECT 'COO', 2000000 WHERE NOT EXISTS (SELECT 1 FROM `mandates` WHERE `role_code` = 'COO' AND `org_unit_id` IS NULL AND `application_type` IS NULL);
--> statement-breakpoint
INSERT INTO `mandates` (`role_code`, `max_amount`) SELECT 'CEO', 999999999 WHERE NOT EXISTS (SELECT 1 FROM `mandates` WHERE `role_code` = 'CEO' AND `org_unit_id` IS NULL AND `application_type` IS NULL);
