CREATE TABLE `master_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type_code` text NOT NULL,
	`code` text NOT NULL,
	`name_en` text NOT NULL,
	`name_he` text NOT NULL,
	`parent_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`attributes` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `master_items_type_code_unique` ON `master_items` (`type_code`,`code`);--> statement-breakpoint
CREATE INDEX `master_items_type_idx` ON `master_items` (`type_code`);--> statement-breakpoint
CREATE TABLE `master_types` (
	`code` text PRIMARY KEY NOT NULL,
	`label_en` text NOT NULL,
	`label_he` text NOT NULL,
	`description` text,
	`parent_type_code` text,
	`attribute_defs` text DEFAULT '[]' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
