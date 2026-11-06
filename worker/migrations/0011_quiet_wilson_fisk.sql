CREATE TABLE `org_levels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`depth` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_levels_name_unique` ON `org_levels` (`name`);--> statement-breakpoint
CREATE TABLE `org_units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`level_id` integer NOT NULL,
	`parent_id` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_units_code_unique` ON `org_units` (`code`);--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `org_unit_id` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `org_unit_id` integer;--> statement-breakpoint
INSERT INTO `org_levels` (`name`, `depth`) VALUES ('Head Office', 1), ('Region', 2), ('Branch', 3);
