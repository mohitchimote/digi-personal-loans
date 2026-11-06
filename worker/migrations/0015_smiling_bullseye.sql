ALTER TABLE `users` ADD `is_available` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_case_tracks` ADD `assigned_at` text;--> statement-breakpoint
INSERT INTO role_entitlements (role_code, entitlement) SELECT code, 'case.assign' FROM roles WHERE code IN ('SENIOR_UNDERWRITER','HEAD_OF_LENDING','COO','CEO') AND NOT EXISTS (SELECT 1 FROM role_entitlements re WHERE re.role_code = roles.code AND re.entitlement = 'case.assign');
