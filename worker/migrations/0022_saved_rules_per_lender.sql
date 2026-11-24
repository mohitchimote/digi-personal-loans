PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_letter_saved_rules` (
	`lender_id` integer DEFAULT 1 NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`rule_json` text NOT NULL,
	`updated_at` text,
	`updated_by` text,
	PRIMARY KEY(`lender_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_letter_saved_rules`("lender_id", "id", "name", "rule_json", "updated_at", "updated_by") SELECT "lender_id", "id", "name", "rule_json", "updated_at", "updated_by" FROM `letter_saved_rules`;--> statement-breakpoint
DROP TABLE `letter_saved_rules`;--> statement-breakpoint
ALTER TABLE `__new_letter_saved_rules` RENAME TO `letter_saved_rules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;