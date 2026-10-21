CREATE TABLE `gateway_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`doc_id` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_checkout_id` text,
	`provider_payment_id` text,
	`url` text,
	`failure_message` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE INDEX `gateway_checkouts_doc_idx` ON `gateway_checkouts` (`business_id`,`doc_type`,`doc_id`);--> statement-breakpoint
CREATE TABLE `gateway_settings` (
	`business_id` text PRIMARY KEY NOT NULL,
	`is_enabled` integer DEFAULT false NOT NULL,
	`secret_key` text,
	`webhook_secret` text,
	`method_id` text,
	`updated_at` integer DEFAULT 0 NOT NULL
);
