CREATE TABLE `role_entitlements` (
	`role_code` text NOT NULL,
	`entitlement` text NOT NULL,
	PRIMARY KEY(`role_code`, `entitlement`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`scope` text DEFAULT 'ALL' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);

--> statement-breakpoint
INSERT INTO `roles` (`code`,`label`,`scope`,`is_system`,`locked`,`created_at`) VALUES ('BANKER','Banker','UNIT_TREE',1,0,'2026-11-06T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('BANKER','portal.banker');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('BANKER','queue.banker');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('BANKER','dashboard.view');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('BANKER','case.addNote');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('BANKER','case.actAsCustomer');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('BANKER','mandates.view');
--> statement-breakpoint
INSERT INTO `roles` (`code`,`label`,`scope`,`is_system`,`locked`,`created_at`) VALUES ('UNDERWRITER','Underwriter','ALL',1,0,'2026-11-06T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','portal.underwriter');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','queue.pipeline');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','dashboard.view');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','case.addNote');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','case.editSection');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','case.approve');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','case.decline');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','case.sendBack');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','case.refer');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','case.disburse');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','case.disburseSecondCheck');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','case.resolveVerification');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('UNDERWRITER','mandates.view');
--> statement-breakpoint
INSERT INTO `roles` (`code`,`label`,`scope`,`is_system`,`locked`,`created_at`) VALUES ('SENIOR_UNDERWRITER','Senior Underwriter','ALL',1,0,'2026-11-06T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','portal.underwriter');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','queue.pipeline');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','dashboard.view');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','case.addNote');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','case.editSection');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','case.approve');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','case.decline');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','case.sendBack');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','case.refer');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','case.disburse');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','case.disburseSecondCheck');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','case.resolveVerification');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('SENIOR_UNDERWRITER','mandates.view');
--> statement-breakpoint
INSERT INTO `roles` (`code`,`label`,`scope`,`is_system`,`locked`,`created_at`) VALUES ('HEAD_OF_LENDING','Head of Lending','ALL',1,0,'2026-11-06T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','portal.underwriter');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','queue.pipeline');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','dashboard.view');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','case.addNote');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','case.editSection');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','case.approve');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','case.decline');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','case.sendBack');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','case.refer');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','case.disburse');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','case.disburseSecondCheck');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','case.resolveVerification');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('HEAD_OF_LENDING','mandates.view');
--> statement-breakpoint
INSERT INTO `roles` (`code`,`label`,`scope`,`is_system`,`locked`,`created_at`) VALUES ('COO','COO','ALL',1,0,'2026-11-06T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','portal.underwriter');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','queue.pipeline');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','dashboard.view');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','case.addNote');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','case.editSection');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','case.approve');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','case.decline');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','case.sendBack');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','case.refer');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','case.disburse');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','case.disburseSecondCheck');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','case.resolveVerification');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('COO','mandates.view');
--> statement-breakpoint
INSERT INTO `roles` (`code`,`label`,`scope`,`is_system`,`locked`,`created_at`) VALUES ('CEO','CEO','ALL',1,0,'2026-11-06T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','portal.underwriter');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','queue.pipeline');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','dashboard.view');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','case.addNote');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','case.editSection');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','case.approve');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','case.decline');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','case.sendBack');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','case.refer');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','case.disburse');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','case.disburseSecondCheck');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','case.resolveVerification');
--> statement-breakpoint
INSERT INTO `role_entitlements` (`role_code`,`entitlement`) VALUES ('CEO','mandates.view');
--> statement-breakpoint
INSERT INTO `roles` (`code`,`label`,`scope`,`is_system`,`locked`,`created_at`) VALUES ('ADMIN','Admin','ALL',1,1,'2026-11-06T00:00:00.000Z');
