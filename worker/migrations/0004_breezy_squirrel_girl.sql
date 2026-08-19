ALTER TABLE `faqs` ADD `question_he` text;--> statement-breakpoint
ALTER TABLE `faqs` ADD `answer_he` text;--> statement-breakpoint
ALTER TABLE `users` ADD `preferred_language` text DEFAULT 'en' NOT NULL;