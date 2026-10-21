CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`period_days` integer DEFAULT 30 NOT NULL,
	`max_users` integer DEFAULT 0 NOT NULL,
	`max_locations` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_admins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_admins_email_uq` ON `platform_admins` (`email`);--> statement-breakpoint
CREATE TABLE `platform_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`plan_id` text NOT NULL,
	`plan_name` text NOT NULL,
	`business_id` text,
	`email` text NOT NULL,
	`shop_name` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`period_days` integer DEFAULT 30 NOT NULL,
	`signup_data` text,
	`password_hash` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_checkout_id` text,
	`provider_payment_id` text,
	`url` text,
	`failure_message` text,
	`created_at` integer NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE INDEX `platform_orders_status_idx` ON `platform_orders` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `platform_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`require_payment` integer DEFAULT false NOT NULL,
	`is_enabled` integer DEFAULT false NOT NULL,
	`secret_key` text,
	`webhook_secret` text,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `businesses` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `plan_id` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `subscription_ends_at` integer;