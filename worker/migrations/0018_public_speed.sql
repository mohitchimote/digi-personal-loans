ALTER TABLE `org_levels` ADD `master_type_code` text;--> statement-breakpoint
ALTER TABLE `org_units` ADD `name_he` text;--> statement-breakpoint
ALTER TABLE `org_units` ADD `master_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `org_units_level_master_unique` ON `org_units` (`level_id`,`master_code`);