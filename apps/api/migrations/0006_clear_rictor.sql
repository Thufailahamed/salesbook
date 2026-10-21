CREATE TABLE `bank_statement_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`matched_line_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bank_statement_lines_account_idx` ON `bank_statement_lines` (`business_id`,`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `fixed_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`account_id` text NOT NULL,
	`paid_from_account_id` text NOT NULL,
	`acquired_on` text NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`salvage` integer DEFAULT 0 NOT NULL,
	`useful_life_months` integer NOT NULL,
	`accumulated` integer DEFAULT 0 NOT NULL,
	`depreciated_through` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fixed_assets_business_idx` ON `fixed_assets` (`business_id`);