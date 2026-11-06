CREATE TABLE `case_referrals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_ref` text NOT NULL,
	`from_role` text NOT NULL,
	`from_user_id` integer NOT NULL,
	`from_name` text NOT NULL,
	`to_role` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE TABLE `mandates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_code` text NOT NULL,
	`org_unit_id` integer,
	`application_type` text,
	`max_amount` real NOT NULL
);
--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `referred_to_role` text;--> statement-breakpoint
ALTER TABLE `roles` ADD `escalation_rank` integer;
--> statement-breakpoint
UPDATE `roles` SET `escalation_rank` = 1 WHERE `code` = 'UNDERWRITER';
--> statement-breakpoint
INSERT INTO `mandates` (`role_code`,`max_amount`) SELECT 'UNDERWRITER', `underwriter_limit` FROM `mandate_rules` WHERE `id` = 1;
--> statement-breakpoint
UPDATE `roles` SET `escalation_rank` = 2 WHERE `code` = 'SENIOR_UNDERWRITER';
--> statement-breakpoint
INSERT INTO `mandates` (`role_code`,`max_amount`) SELECT 'SENIOR_UNDERWRITER', `senior_underwriter_limit` FROM `mandate_rules` WHERE `id` = 1;
--> statement-breakpoint
UPDATE `roles` SET `escalation_rank` = 3 WHERE `code` = 'HEAD_OF_LENDING';
--> statement-breakpoint
INSERT INTO `mandates` (`role_code`,`max_amount`) SELECT 'HEAD_OF_LENDING', `head_of_lending_limit` FROM `mandate_rules` WHERE `id` = 1;
--> statement-breakpoint
UPDATE `roles` SET `escalation_rank` = 4 WHERE `code` = 'COO';
--> statement-breakpoint
INSERT INTO `mandates` (`role_code`,`max_amount`) SELECT 'COO', `coo_limit` FROM `mandate_rules` WHERE `id` = 1;
--> statement-breakpoint
UPDATE `roles` SET `escalation_rank` = 5 WHERE `code` = 'CEO';
--> statement-breakpoint
INSERT INTO `mandates` (`role_code`,`max_amount`) SELECT 'CEO', `ceo_limit` FROM `mandate_rules` WHERE `id` = 1;
