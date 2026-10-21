CREATE TABLE `promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`product_id` text,
	`variant_id` text,
	`kind` text NOT NULL,
	`value` real DEFAULT 0 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `promotions_business_idx` ON `promotions` (`business_id`,`is_active`);