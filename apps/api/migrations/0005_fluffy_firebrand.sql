CREATE TABLE `reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`account_id` text NOT NULL,
	`statement_date` text NOT NULL,
	`statement_balance` integer DEFAULT 0 NOT NULL,
	`line_count` integer NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reconciliations_account_idx` ON `reconciliations` (`business_id`,`account_id`,`statement_date`);--> statement-breakpoint
ALTER TABLE `businesses` ADD `books_closed_through` text;--> statement-breakpoint
ALTER TABLE `journal_lines` ADD `reconciliation_id` text;