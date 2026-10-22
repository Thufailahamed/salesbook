CREATE TABLE `message_settings` (
	`business_id` text PRIMARY KEY NOT NULL,
	`sms_provider` text DEFAULT 'none' NOT NULL,
	`notify_user_id` text,
	`notify_api_key` text,
	`sender_id` text,
	`country_code` text DEFAULT '94' NOT NULL,
	`include_pay_link` integer DEFAULT true NOT NULL,
	`receipt_template` text,
	`reminder_template` text,
	`ready_template` text,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`kind` text NOT NULL,
	`channel` text NOT NULL,
	`customer_id` text,
	`doc_type` text,
	`doc_id` text,
	`to_phone` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`provider_ref` text,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_customer_idx` ON `messages` (`business_id`,`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_business_idx` ON `messages` (`business_id`,`created_at`);